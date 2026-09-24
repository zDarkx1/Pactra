package workspace

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuthCleanupResult contains only committed deletions. On any error all fields
// are zero; a failed/ambiguous commit must not be reported as a success.
type AuthCleanupResult struct {
	Sessions        int64
	Challenges      int64
	ChallengeLimits int64
}

const MaxAuthCleanupBatch = 1000

// CleanupExpiredAuth deletes at most limit rows TOTAL, in one transaction.
// Only expired sessions, expired challenges (consumed or not), and challenge
// windows at least one minute old qualify. Live/consumed-but-unexpired auth is
// retained. Accounts, tasks and AI usage are never deleted or updated.
// Concurrent workers skip locked rows. Callers supply a deadline and schedule;
// this function does not launch a background worker or own the pool.
func CleanupExpiredAuth(ctx context.Context, pool *pgxpool.Pool, limit int) (AuthCleanupResult, error) {
	if pool == nil || limit <= 0 || limit > MaxAuthCleanupBatch {
		return AuthCleanupResult{}, errors.New("auth cleanup requires a pool and limit between 1 and 1000")
	}
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return AuthCleanupResult{}, err
	}
	defer tx.Rollback(ctx)
	var cutoff time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&cutoff); err != nil {
		return AuthCleanupResult{}, err
	}
	result := AuthCleanupResult{}
	remaining := int64(limit)
	// Identifiers are closed, source-code constants, never caller input.
	for _, spec := range []struct {
		table, key, expiry string
		cutoff             time.Time
		deleted            *int64
	}{
		{"sessions", "token_hash", "expires_at", cutoff, &result.Sessions},
		{"challenges", "id", "expires_at", cutoff, &result.Challenges},
		{"challenge_limits", "address", "window_start", cutoff.Add(-time.Minute), &result.ChallengeLimits},
	} {
		if remaining == 0 {
			break
		}
		query := fmt.Sprintf(`WITH expired AS (
			SELECT %s FROM pactra.%s WHERE %s <= $1
			ORDER BY %s,%s LIMIT $2 FOR UPDATE SKIP LOCKED
		) DELETE FROM pactra.%s AS target USING expired
		WHERE target.%s=expired.%s AND target.%s <= $1`,
			spec.key, spec.table, spec.expiry, spec.expiry, spec.key,
			spec.table, spec.key, spec.key, spec.expiry)
		tag, err := tx.Exec(ctx, query, spec.cutoff, remaining)
		if err != nil {
			return AuthCleanupResult{}, err
		}
		*spec.deleted = tag.RowsAffected()
		remaining -= *spec.deleted
	}
	if err = tx.Commit(ctx); err != nil {
		return AuthCleanupResult{}, err
	}
	return result, nil
}
