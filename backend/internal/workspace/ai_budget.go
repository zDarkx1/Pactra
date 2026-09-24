package workspace

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

// AIBudgetLimits counts admitted review requests, NOT tokens or currency.
// Both limits must be explicitly positive and within the low safety ceilings.
// All instances sharing a database must use the same configured limits.
// The zero value disables dispatch, even when an inner provider is configured.
type AIBudgetLimits struct {
	WalletDaily int
	GlobalDaily int
}

const (
	MaxAIWalletDaily = 100
	MaxAIGlobalDaily = 1000
)

func (l AIBudgetLimits) enabled() bool {
	return l.WalletDaily > 0 && l.WalletDaily <= MaxAIWalletDaily &&
		l.GlobalDaily > 0 && l.GlobalDaily <= MaxAIGlobalDaily
}

// budgetedAI authenticates using the existing audience-bound session lookup.
// The parent mounts this ONLY at POST /api/v1/review and owns the request timeout.
// Reservation commits before dispatch. No refund is made for validation errors,
// provider failures, timeouts, cancellation, or a crash after commit: under-use
// is preferable to an uncounted provider attempt. It never changes task state.
func (s *server) budgetedAI(inner http.Handler, limits AIBudgetLimits) http.HandlerFunc {
	return s.auth(func(w http.ResponseWriter, r *http.Request, wallet string) {
		if inner == nil || !limits.enabled() {
			fail(w, http.StatusServiceUnavailable)
			return
		}
		allowed, err := s.reserveAI(r.Context(), wallet, limits)
		if err != nil {
			fail(w, http.StatusServiceUnavailable)
			return
		}
		if !allowed {
			fail(w, http.StatusTooManyRequests)
			return
		}
		// Cancellation after commit still spends the reservation, but does not
		// knowingly start new provider work for an already cancelled request.
		if r.Context().Err() != nil {
			fail(w, http.StatusServiceUnavailable)
			return
		}
		inner.ServeHTTP(w, r)
	})
}

func (s *server) reserveAI(ctx context.Context, wallet string, limits AIBudgetLimits) (bool, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	// One database-clock UTC day for BOTH rows, independent of client clocks
	// and session TimeZone. Historical days are retained, not reset in place.
	var day time.Time
	if err = tx.QueryRow(ctx, `SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date`).Scan(&day); err != nil {
		return false, err
	}
	// Lock in the same global-then-wallet order across every instance. Atomic
	// conditional UPSERTs serialize admission, including initially absent rows.
	// A wallet rejection rolls back the global increment in this transaction.
	var count int
	err = tx.QueryRow(ctx, `INSERT INTO pactra.ai_usage_global(usage_day,count) VALUES($1,1)
		ON CONFLICT(usage_day) DO UPDATE SET count=pactra.ai_usage_global.count+1
		WHERE pactra.ai_usage_global.count<$2 RETURNING count`, day, limits.GlobalDaily).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	err = tx.QueryRow(ctx, `INSERT INTO pactra.ai_usage_wallet(usage_day,address,count) VALUES($1,$2,1)
		ON CONFLICT(usage_day,address) DO UPDATE SET count=pactra.ai_usage_wallet.count+1
		WHERE pactra.ai_usage_wallet.count<$3 RETURNING count`, day, wallet, limits.WalletDaily).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
