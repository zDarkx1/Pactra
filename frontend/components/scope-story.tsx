import Link from 'next/link';
import { ArrowUpRight, Fingerprint, Check } from '@phosphor-icons/react/dist/ssr';

const steps = [
 { number:'01', title:'Make the brief specific.', text:'Source strings, deliverables, review terms. Set the boundaries before someone starts.', mark:'Scope', example:'A source. A standard. A shared starting point.' },
 { number:'02', title:'Keep the evidence close.', text:'Versioned JSON, exact differences and deterministic checks. A result you can inspect, not a mysterious score.', mark:'Evidence', example:'The version changes. The agreed scope does not.' },
 { number:'03', title:'Leave the decision human.', text:'The buyer reviews the submitted version. Request an agreed revision, or record acceptance. Neither action moves funds.', mark:'Decision', example:'A check informs the conversation. It does not end it.' },
];
export function ScopeStory(){return <section id="capabilities" data-scope-story className="relative overflow-clip bg-[#eee8dd] px-6 py-16 sm:px-10 lg:px-16 lg:py-24" aria-labelledby="scope-story-title">
 <div className="mx-auto max-w-[1248px]">
  <div className="mb-12 flex flex-wrap items-end justify-between gap-8 border-t border-[#cfc6b7] pt-8">
   <div><h2 id="scope-story-title" className="m-0 max-w-2xl font-serif text-[clamp(2.8rem,6vw,5.8rem)] leading-[.98] font-normal tracking-[-.045em]">Not more paperwork.<br/><em className="text-[#a9583e]">Less guesswork.</em></h2></div>
   <p className="m-0 max-w-xs text-sm text-body">Scroll through a shared record. The illustration is a process, not a live customer agreement.</p>
  </div>
  <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
   <div className="relative min-w-0 self-start lg:sticky lg:top-28">
    <div aria-hidden="true" className="relative mx-auto flex aspect-[1.05] max-w-[480px] items-center justify-center px-5 py-8">
     <div data-scope-paper="back" className="absolute inset-x-8 inset-y-10 rounded-sm border border-[#c8baaa] bg-[#c9b29b] shadow-sm"/>
     <div data-scope-paper="middle" className="absolute inset-x-8 inset-y-10 rounded-sm border border-[#c8baaa] bg-[#e1d2bf] shadow-sm"/>
     <div data-scope-paper="front" className="relative w-full max-w-[380px] rounded-sm border border-[#d4cbbd] bg-[#fffdf7] p-7 shadow-[0_18px_55px_-30px_#59473670] sm:p-10">
      <div className="mb-9 flex items-center justify-between border-b border-[#e0d8cc] pb-4"><span className="font-mono text-[10px] tracking-widest">PACTRA / SHARED RECORD</span><Fingerprint size={22}/></div>
      <p className="mb-7 font-serif text-4xl leading-[1.02] text-ink">On the<br/><em>same page.</em></p>
      {['Agreed scope','Versioned evidence','Human review'].map((x,i)=><div key={x} className="flex items-center gap-3 border-t border-[#e6dfd8] py-3 text-xs"><span className="font-mono text-[#a9583e]">0{i+1}</span>{x}</div>)}
      <div data-scope-seal className="absolute -right-3 -bottom-5 flex size-24 rotate-[-12deg] flex-col items-center justify-center rounded-full border-2 border-[#a9583e] bg-[#f8eddf] text-[#8e432d]"><Check size={24}/><span className="font-mono text-[9px] tracking-wider">SCOPE FIRST</span></div>
     </div>
    </div>
    <p className="mt-5 mb-0 text-center font-mono text-[10px] tracking-wider uppercase text-muted">Illustrative record · No funds move</p>
   </div>
   <ol className="m-0 list-none p-0">{steps.map(s=><li key={s.number} data-scope-step className="flex min-h-[250px] flex-col justify-center border-t border-[#cfc6b7] py-10 lg:min-h-[340px]"><div className="mb-6 flex items-center gap-4"><span className="font-mono text-xs text-[#a9583e]">/{s.number}</span><span className="font-mono text-[10px] tracking-[.14em] uppercase text-muted">{s.mark}</span></div><h3 className="mb-4 font-serif text-4xl leading-[1.08] font-normal lg:text-5xl">{s.title}</h3><p className="max-w-lg text-base leading-relaxed text-body">{s.text}</p><p className="mt-3 mb-0 max-w-md border-l-2 border-[#a9583e]/40 pl-4 font-serif text-xl italic text-muted [text-wrap:pretty]">{s.example}</p></li>)}</ol>
  </div>
  <Link href="/tasks" className="mt-8 inline-flex min-h-12 items-center gap-5 border-b border-ink py-3 text-sm text-ink no-underline">Explore the workspace<ArrowUpRight size={18}/></Link>
 </div>
</section>}
