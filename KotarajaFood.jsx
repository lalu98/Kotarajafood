// ═══════════════════════════════════════════════════════════════════════
// KotarajaFood.jsx  — Production MVP with Supabase
// ─────────────────────────────────────────────────────────────────────
// SETUP:
//   1. Run supabase_schema.sql in your Supabase SQL Editor
//   2. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
//   3. npm install @supabase/supabase-js
//   4. Deploy to Vercel
// ═══════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────
// 🔑 SUPABASE CONFIG — Replace with your project credentials
// ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────
const DUSUN = [
  "Kedondong","Otak Desa Barat","Otak Desa Timur","Dayen Peken",
  "Dalem Lauq","Marang Selatan","Marang Utara","Jabon",
  "Tibu Karang","Dasan Petung","Lingkok Marang","Kebon Dalem","Tanggluk"
];

const ONGKIR_RULES = { dalam: 3000, antar: 5000, luar: 10000 };
const DP_THRESHOLD     = 50000;
const MIN_TRUST_COD    = 2;
const MAX_ITEM_TYPES   = 3;
const MAX_QTY_ITEM     = 10;
const FORCE_DP_CANCEL  = 2;
const BLOCK_ON_FAIL    = 3;
const DP_WINDOW_SEC    = 600;

const getOngkir = (fromDusun, toDusun) => {
  if (!toDusun) return null;
  if (toDusun === "__luar") return ONGKIR_RULES.luar;
  if (fromDusun === toDusun) return ONGKIR_RULES.dalam;
  return ONGKIR_RULES.antar;
};

const evalProtection = (user, total) => {
  if (!user || user.blocked) return { requireDP: false, dpAmt: 0, reason: "", blocked: true };
  const forceDP  = (user.cancel_count || 0) >= FORCE_DP_CANCEL;
  const bigOrder = total >= DP_THRESHOLD;
  const lowTrust = (user.trust_score || 0) < MIN_TRUST_COD;
  if (forceDP)             return { requireDP: true,  dpAmt: Math.ceil(total * .5), reason: "Ada riwayat pembatalan — DP diperlukan untuk konfirmasi pesanan 🙏", blocked: false };
  if (bigOrder || lowTrust) return { requireDP: true, dpAmt: Math.ceil(total * .5), reason: bigOrder ? "Pesanan besar memerlukan DP untuk memastikan ketersediaan 🙏" : "Pengguna baru memerlukan DP kecil untuk konfirmasi pesanan pertama 🙏", blocked: false };
  return { requireDP: false, dpAmt: 0, reason: "", blocked: false };
};

const getTier = s => {
  if (s < 0)  return { label: "⚠️ Risiko Tinggi",  pct: 2  };
  if (s < 2)  return { label: "🌱 Pengguna Baru",  pct: 22 };
  if (s < 5)  return { label: "✅ Terpercaya",      pct: 58 };
  if (s < 10) return { label: "⭐ Pelanggan Setia", pct: 82 };
  return            { label: "👑 Member VIP",       pct: 100 };
};

const fmt = n => "Rp " + (n || 0).toLocaleString("id-ID");
const ts  = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#FFF9F5; --p:#E8430A; --pd:#C4350A; --pl:#FFF0EB; --pll:#FFF8F5;
  --ac:#F7A228; --acl:#FFF6E8;
  --gn:#16A34A; --gnl:#DCFCE7;
  --bl:#2563EB; --bll:#DBEAFE;
  --yl:#D97706; --yll:#FEF3C7;
  --pu:#7C3AED; --pul:#EDE9FE;
  --rd:#DC2626; --rdl:#FEE2E2;
  --t:#111827;  --t2:#6B7280; --t3:#9CA3AF;
  --bd:#F3EDE6; --bd2:#E5E7EB;
  --sh:0 2px 10px rgba(0,0,0,.07);
  --shm:0 4px 24px rgba(0,0,0,.11);
  --r:16px; --rs:12px;
}
html,body{overscroll-behavior:none}
body{font-family:'Plus Jakarta Sans',sans-serif;background:#E8E0D8;color:var(--t);-webkit-font-smoothing:antialiased}
.app{max-width:430px;margin:0 auto;min-height:100vh;background:var(--bg);display:flex;flex-direction:column;position:relative;overflow:hidden}
.scr{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding-bottom:80px}

/* NAV */
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:#fff;border-top:1.5px solid var(--bd);display:flex;z-index:70;box-shadow:0 -4px 20px rgba(0,0,0,.08)}
.ni{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9px 4px 10px;cursor:pointer;gap:3px;user-select:none}
.ni .nic{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--t3);transition:all .18s}
.ni.on .nic{background:var(--pl);color:var(--p)}
.ni .nlb{font-size:9px;font-weight:700;color:var(--t3);font-family:'Nunito'}
.ni.on .nlb{color:var(--p)}

/* HEADER */
.hdr{background:var(--p);padding:16px 16px 18px;position:sticky;top:0;z-index:60;flex-shrink:0}
.hdrw{background:#fff;border-bottom:1.5px solid var(--bd);padding:14px 16px;position:sticky;top:0;z-index:60;flex-shrink:0}
.hrow{display:flex;align-items:center;justify-content:space-between;gap:10px}
.logo{font-family:'Nunito';font-weight:900;font-size:22px;color:#fff;letter-spacing:-.5px}
.logo em{color:var(--ac);font-style:normal}
.hloc{font-size:11px;color:rgba(255,255,255,.72);margin-top:3px}
.htitle{font-family:'Nunito';font-weight:800;font-size:17px;color:var(--t)}
.ibtn{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.18);border:none;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
.ibtn.dk{background:var(--bd);color:var(--t)}
.cbdg{position:absolute;top:-4px;right:-4px;background:var(--ac);color:#fff;width:18px;height:18px;border-radius:50%;font-family:'Nunito';font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid var(--p)}

/* SEARCH */
.sbox{margin-top:12px;position:relative}
.sinp{width:100%;background:#fff;border:none;border-radius:12px;padding:12px 14px 12px 42px;font-size:14px;font-family:'Plus Jakarta Sans';color:var(--t);outline:none;box-shadow:var(--shm)}
.sico{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:15px;pointer-events:none}

/* SCROLL ROW */
.hscr{display:flex;gap:8px;overflow-x:auto;padding:12px 16px 4px;scrollbar-width:none}
.hscr::-webkit-scrollbar{display:none}

/* CATEGORY */
.cat{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;padding:9px 12px;background:#fff;border-radius:13px;border:2px solid transparent;box-shadow:var(--sh);transition:all .18s;user-select:none}
.cat.on{background:var(--pl);border-color:var(--p)}
.cico{font-size:22px}
.clbl{font-size:10px;font-weight:700;color:var(--t2);font-family:'Nunito';white-space:nowrap}
.cat.on .clbl{color:var(--p)}

/* BANNER */
.bnr{margin:4px 16px 0;background:linear-gradient(135deg,#E8430A,#F7A228);border-radius:18px;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;position:relative;overflow:hidden}
.bnr::before{content:'';position:absolute;right:-20px;bottom:-20px;width:120px;height:120px;background:rgba(255,255,255,.08);border-radius:50%}
.bnrt{font-family:'Nunito';font-weight:900;font-size:16px;color:#fff;line-height:1.35;position:relative;z-index:1}
.bnrs{font-size:11px;color:rgba(255,255,255,.82);margin-top:3px;position:relative;z-index:1}
.bnri{font-size:50px;position:relative;z-index:1;flex-shrink:0}

/* SECTION */
.sec{padding:16px 16px 0}
.sechd{font-family:'Nunito';font-weight:800;font-size:15px;color:var(--t);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between}

/* WARUNG CARD */
.wcard{background:#fff;border-radius:var(--r);box-shadow:var(--sh);overflow:hidden;margin-bottom:10px;cursor:pointer;transition:transform .15s}
.wcard:active{transform:scale(.985)}
.wimg{width:100%;height:128px;background:linear-gradient(135deg,#F5EDE0,#EAD5BB);display:flex;align-items:center;justify-content:center;font-size:54px;position:relative}
.wopen{position:absolute;top:9px;right:9px}
.wbody{padding:11px 13px 13px}
.wname{font-family:'Nunito';font-weight:800;font-size:14px;color:var(--t)}
.wrow{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}
.wmeta{font-size:11px;color:var(--t2)}
.wlmk{font-size:11px;color:var(--t3);margin-top:3px}

/* BADGES */
.bdg{display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;font-family:'Nunito';white-space:nowrap}
.br{background:var(--pl);color:var(--p)} .bg{background:var(--gnl);color:var(--gn)} .by{background:var(--yll);color:var(--yl)}
.bb{background:var(--bll);color:var(--bl)} .bx{background:#F3F4F6;color:#6B7280}
.bpu{background:var(--pul);color:var(--pu)} .brd{background:var(--rdl);color:var(--rd)}

/* MENU ITEM */
.mi{background:#fff;border-radius:var(--rs);box-shadow:var(--sh);display:flex;gap:10px;padding:11px;margin-bottom:9px}
.mimg{width:70px;height:70px;border-radius:10px;background:linear-gradient(135deg,#F5EDE0,#EAD5BB);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:30px}
.mdet{flex:1;min-width:0}
.mn{font-family:'Nunito';font-weight:800;font-size:13px}
.md{font-size:11px;color:var(--t3);margin-top:2px;line-height:1.4}
.mp{font-size:13px;font-weight:700;color:var(--p);margin-top:5px;font-family:'Nunito'}

/* QTY */
.qwrap{display:flex;align-items:center;gap:8px;flex-shrink:0;align-self:center}
.qbtn{width:30px;height:30px;border-radius:9px;border:none;background:var(--pl);color:var(--p);font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center}
.qbtn:active{background:var(--pd);color:#fff}
.qbtn.m{background:#F3EDE6;color:var(--t2)}
.qbtn:disabled{opacity:.3;cursor:not-allowed}
.qn{font-family:'Nunito';font-weight:900;font-size:15px;min-width:20px;text-align:center}
.addbtn{width:32px;height:32px;border-radius:10px;background:var(--p);border:none;color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;align-self:center;flex-shrink:0}
.addbtn:active{background:var(--pd)}
.addbtn:disabled{background:var(--t3);cursor:not-allowed}

/* INFO ROW */
.irow{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:var(--t2);padding:8px 0;border-bottom:1px solid var(--bd)}
.irow:last-child{border-bottom:none}
.iico{font-size:15px;width:22px;text-align:center;flex-shrink:0;margin-top:1px}

/* CARD */
.card{background:#fff;border-radius:var(--r);box-shadow:var(--sh);padding:14px;margin-bottom:10px}
.chd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.ctitle{font-family:'Nunito';font-weight:800;font-size:14px}

/* FORM */
.fg{margin-bottom:14px}
.fl{font-size:12px;font-weight:700;color:var(--t2);margin-bottom:6px;display:block;font-family:'Nunito'}
.fi{width:100%;background:#fff;border:2px solid var(--bd2);border-radius:12px;padding:12px 13px;font-size:14px;font-family:'Plus Jakarta Sans';color:var(--t);outline:none;transition:border-color .18s;-webkit-appearance:none}
.fi:focus{border-color:var(--p)}
textarea.fi{resize:none;height:76px;line-height:1.5}
select.fi{cursor:pointer}

/* BUTTON */
.btn{width:100%;border:none;border-radius:14px;padding:16px;font-family:'Nunito';font-weight:800;font-size:16px;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px;user-select:none}
.bpri{background:var(--p);color:#fff}  .bpri:active{background:var(--pd)}
.bpri:disabled{opacity:.5;cursor:not-allowed}
.bsec{background:var(--pl);color:var(--p)} .bsec:active{background:#FFDED2}
.bgrn{background:var(--gn);color:#fff}    .bgrn:active{background:#138A3D}
.byel{background:var(--ac);color:#fff}    .byel:active{background:#E09220}
.brd2{background:var(--rd);color:#fff}
.bsm{padding:10px 16px;font-size:13px;border-radius:10px;width:auto}

/* NOTIF */
.nbox{border-radius:12px;padding:12px 14px;margin-bottom:10px;display:flex;gap:10px;align-items:flex-start}
.nbox.gn{background:var(--gnl)} .nbox.yl{background:var(--yll)} .nbox.rd{background:var(--rdl)} .nbox.bl{background:var(--bll)} .nbox.or{background:var(--acl)}
.nit{font-family:'Nunito';font-weight:700;font-size:12px}
.nit.gn{color:var(--gn)} .nit.yl{color:var(--yl)} .nit.rd{color:var(--rd)} .nit.bl{color:var(--bl)} .nit.or{color:var(--yl)}
.nip{font-size:11px;color:var(--t2);margin-top:2px;line-height:1.5}

/* DIVIDER */
.div{height:7px;background:var(--bd);margin:14px 0}

/* CHIPS */
.chips{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}
.chip{padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;border:2px solid var(--bd2);background:#fff;cursor:pointer;font-family:'Nunito';color:var(--t2);user-select:none}
.chip.on{background:var(--pl);border-color:var(--p);color:var(--p)}

/* STATS */
.sgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:14px}
.st{background:#fff;border-radius:var(--rs);padding:13px;box-shadow:var(--sh)}
.sl{font-size:10px;color:var(--t3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-family:'Nunito'}
.sv{font-family:'Nunito';font-weight:900;font-size:20px;color:var(--t);margin-top:4px}
.sv.r{color:var(--p)} .sv.g{color:var(--gn)} .sv.s{font-size:14px}

/* TABS */
.tabs{display:flex;border-bottom:2px solid var(--bd);margin-bottom:14px}
.tab{flex:1;text-align:center;padding:11px 4px;font-family:'Nunito';font-weight:700;font-size:12px;cursor:pointer;color:var(--t3);border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:all .18s;user-select:none}
.tab.on{color:var(--p);border-bottom-color:var(--p)}

/* CART DRAWER */
.co{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;opacity:0;transition:opacity .28s;pointer-events:none}
.co.open{opacity:1;pointer-events:all}
.cd{position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(100%);width:100%;max-width:430px;background:#fff;border-radius:22px 22px 0 0;z-index:201;transition:transform .32s cubic-bezier(.4,0,.2,1);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -8px 40px rgba(0,0,0,.2)}
.cd.open{transform:translateX(-50%) translateY(0)}
.cdh{width:40px;height:4px;background:var(--bd2);border-radius:2px;margin:12px auto 0;flex-shrink:0}
.cdhd{padding:14px 18px 12px;border-bottom:1.5px solid var(--bd);flex-shrink:0;display:flex;align-items:center;justify-content:space-between}
.cdtitle{font-family:'Nunito';font-weight:900;font-size:18px;color:var(--t)}
.cdc{width:32px;height:32px;border-radius:10px;background:var(--bd);border:none;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--t2)}
.cdbody{overflow-y:auto;flex:1;padding:14px 16px}
.cdfoot{padding:14px 16px;border-top:1.5px solid var(--bd);flex-shrink:0;background:#fff}
.cir{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd)}
.cir:last-child{border-bottom:none}
.ciico{width:46px;height:46px;border-radius:10px;background:linear-gradient(135deg,#F5EDE0,#EAD5BB);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}

/* PROGRESS */
.prog{display:flex;align-items:flex-start;margin:14px 0}
.ps{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative}
.ps::after{content:'';position:absolute;top:11px;left:60%;width:80%;height:2px;background:var(--bd2)}
.ps:last-child::after{display:none}
.ps.dn::after{background:var(--gn)}
.pd{width:24px;height:24px;border-radius:50%;background:var(--bd2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--t3);position:relative;z-index:1}
.ps.dn .pd{background:var(--gn);color:#fff}
.ps.ac .pd{background:var(--p);color:#fff;box-shadow:0 0 0 4px var(--pl)}
.plbl{font-size:9px;color:var(--t3);font-weight:700;font-family:'Nunito';text-align:center;line-height:1.3;max-width:54px}
.ps.dn .plbl{color:var(--gn)} .ps.ac .plbl{color:var(--p)}

/* TIMER */
.tbar{display:flex;align-items:center;justify-content:space-between;background:var(--rdl);border-radius:11px;padding:11px 14px;margin-bottom:12px}
.tbar.urg{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.ttitle{font-family:'Nunito';font-weight:800;font-size:13px;color:var(--rd)}
.tsub{font-size:11px;color:var(--t2);margin-top:1px}
.tval{font-family:'Nunito';font-weight:900;font-size:26px;color:var(--rd);letter-spacing:-1px}

/* DP BOX */
.dpbox{background:#FFFBEB;border:2px solid #FCD34D;border-radius:var(--r);padding:16px;margin-bottom:14px}
.dpamts{display:flex;gap:8px;margin-bottom:12px}
.dpab{flex:1;background:#fff;border-radius:10px;padding:10px 12px;text-align:center}
.dpal{font-size:10px;color:var(--t3);font-family:'Nunito';font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.dpav{font-family:'Nunito';font-weight:900;font-size:16px;margin-top:3px}
.dpms{display:flex;gap:7px;margin-bottom:12px}
.dpm{flex:1;border:2px solid var(--bd2);border-radius:10px;padding:8px 4px;text-align:center;cursor:pointer;background:#fff;transition:all .18s;user-select:none}
.dpm.on{border-color:var(--ac);background:var(--acl)}
.dpmi{font-size:18px}
.dpml{font-size:9px;font-weight:700;color:var(--t2);font-family:'Nunito';margin-top:2px}
.dpm.on .dpml{color:var(--yl)}
.bankbox{background:#F8FAFC;border-radius:10px;padding:11px 13px;margin-bottom:12px}
.brow{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px}

/* TRUST */
.tcard{background:linear-gradient(135deg,#7C3AED,#4F46E5);border-radius:var(--r);padding:16px;margin-bottom:12px;position:relative;overflow:hidden}
.tcard::after{content:'🛡️';position:absolute;right:-8px;bottom:-14px;font-size:72px;opacity:.1;line-height:1}
.ttier{font-family:'Nunito';font-weight:900;font-size:18px;color:#fff;margin-bottom:3px}
.tscore-pill{background:rgba(255,255,255,.15);border-radius:10px;padding:8px 12px;text-align:center}
.tscore-num{font-family:'Nunito';font-weight:900;font-size:24px;color:#fff;line-height:1}
.tscore-lbl{font-size:9px;color:rgba(255,255,255,.65);font-family:'Nunito';font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:1px}
.tmeter{height:8px;background:rgba(255,255,255,.2);border-radius:4px;overflow:hidden;margin:12px 0 6px}
.tmfill{height:100%;border-radius:4px;background:linear-gradient(90deg,#34D399,#10B981);transition:width .7s}
.trow{display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.6);font-family:'Nunito';font-weight:700}
.thead-pill{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.16);border-radius:10px;padding:7px 11px;margin-top:10px}
.ts{font-size:12px;opacity:.28} .ts.on{opacity:1}

/* TOAST */
.tw{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none}
.toast{background:#1E293B;color:#fff;padding:12px 24px;border-radius:12px;font-family:'Nunito';font-weight:700;font-size:13px;white-space:nowrap;box-shadow:0 8px 30px rgba(0,0,0,.25);animation:tsanim 2.8s ease forwards}
@keyframes tsanim{0%{opacity:0;transform:translateY(8px)}12%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0}}

/* LOADING / EMPTY */
.spin{width:36px;height:36px;border:3px solid var(--bd);border-top-color:var(--p);border-radius:50%;animation:spin .8s linear infinite;margin:40px auto}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{text-align:center;padding:56px 20px}
.eico{font-size:56px;margin-bottom:12px}
.empty h3{font-family:'Nunito';font-weight:800;font-size:18px;margin-bottom:6px}
.empty p{font-size:13px;color:var(--t3);line-height:1.5}

/* SUCCESS */
.succwrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px 24px;text-align:center;min-height:70vh}
.succico{width:90px;height:90px;border-radius:50%;background:var(--gnl);display:flex;align-items:center;justify-content:center;font-size:44px;margin-bottom:20px}

/* AUTH */
.authwrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 28px;min-height:80vh;text-align:center}
.auth-logo{font-family:'Nunito';font-weight:900;font-size:32px;color:var(--p);margin-bottom:6px}
.auth-logo em{color:var(--ac);font-style:normal}
.auth-sub{font-size:13px;color:var(--t3);margin-bottom:36px;line-height:1.5}
.auth-form{width:100%;max-width:360px}
.rol-opts{display:flex;gap:8px;margin-bottom:16px}
.rol-opt{flex:1;border:2px solid var(--bd2);border-radius:12px;padding:11px 6px;text-align:center;cursor:pointer;background:#fff;transition:all .18s;user-select:none}
.rol-opt.on{border-color:var(--p);background:var(--pl)}
.rol-ico{font-size:24px;margin-bottom:4px}
.rol-lbl{font-size:11px;font-weight:700;color:var(--t2);font-family:'Nunito'}
.rol-opt.on .rol-lbl{color:var(--p)}

/* LIMIT BAR */
.limbar{background:var(--yll);border-radius:10px;padding:9px 12px;margin-bottom:9px;font-size:12px;color:var(--yl);font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #FCD34D}

/* BLOCK SCREEN */
.blockwrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px;text-align:center;min-height:65vh}
.blockico{width:100px;height:100px;border-radius:50%;background:var(--rdl);display:flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:20px}

/* COURIER ORDER */
.co-card{background:#fff;border-radius:var(--r);box-shadow:var(--sh);padding:14px;margin-bottom:10px;border-left:3px solid transparent}
.co-card.new{border-left-color:var(--p)}
.co-card.active{border-left-color:var(--bl)}
.co-card.done{border-left-color:var(--gn);opacity:.8}

/* REALTIME DOT */
.rtdot{width:8px;height:8px;border-radius:50%;background:var(--gn);display:inline-block;margin-right:5px;animation:rtpulse 2s infinite}
@keyframes rtpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
`;

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────
function Toast({ msg }) {
  return msg ? <div className="tw"><div className="toast">{msg}</div></div> : null;
}

function Spinner() { return <div className="spin"/>; }

function StatusBadge({ s }) {
  const M = { pending:["⏳ Menunggu","bdg by"], accepted:["✅ Diterima","bdg bb"], delivering:["🛵 Dikirim","bdg br"], completed:["✔ Selesai","bdg bg"], cancelled:["✕ Dibatal","bdg brd"] };
  const [l, c] = M[s] || ["?","bdg bx"];
  return <span className={c}>{l}</span>;
}

function ProgBar({ steps, cur }) {
  return (
    <div className="prog">
      {steps.map((s, i) => (
        <div key={i} className={`ps ${i < cur ? "dn" : ""} ${i === cur ? "ac" : ""}`}>
          <div className="pd">{i < cur ? "✓" : i + 1}</div>
          <div className="plbl">{s}</div>
        </div>
      ))}
    </div>
  );
}

const statusStep = { pending: 0, accepted: 1, delivering: 3, completed: 4 };
const ORDER_STEPS = ["Diterima", "Warung\nProses", "Kurir\nAmbil", "Di\nJalan", "Sampai"];

// ─────────────────────────────────────────────────────────────────────
// SUPABASE API LAYER
// ─────────────────────────────────────────────────────────────────────
const api = {
  // AUTH / USERS
  async getOrCreateUser(name, phone, role) {
    // Try find existing by name+phone
    const { data: existing } = await supabase
      .from("users").select("*").eq("name", name).eq("phone", phone).maybeSingle();
    if (existing) return existing;
    const { data, error } = await supabase
      .from("users").insert({ name, phone, role }).select().single();
    if (error) throw error;
    return data;
  },

  // WARUNGS
  async getWarungs() {
    const { data, error } = await supabase.from("warungs").select("*").order("name");
    if (error) throw error;
    return data;
  },

  async updateWarungOpen(id, is_open) {
    const { error } = await supabase.from("warungs").update({ is_open }).eq("id", id);
    if (error) throw error;
  },

  // MENUS
  async getMenus(warungId) {
    const { data, error } = await supabase.from("menus").select("*").eq("warung_id", warungId).eq("available", true).order("category");
    if (error) throw error;
    return data;
  },

  async addMenu(warungId, { name, description, price, emoji, category }) {
    const { data, error } = await supabase.from("menus")
      .insert({ warung_id: warungId, name, description, price, emoji: emoji || "🍽️", category: category || "Lainnya" })
      .select().single();
    if (error) throw error;
    return data;
  },

  // COURIERS
  async getFirstOnlineCourier() {
    const { data, error } = await supabase.from("couriers").select("*").eq("status", "online").limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async getCouriers() {
    const { data, error } = await supabase.from("couriers").select("*").order("name");
    if (error) throw error;
    return data;
  },

  async setCourierStatus(id, status) {
    const { error } = await supabase.from("couriers").update({ status }).eq("id", id);
    if (error) throw error;
  },

  async addCourierCOD(id, amount) {
    const { data: cur } = await supabase.from("couriers").select("cod_collected").eq("id", id).single();
    const { error } = await supabase.from("couriers").update({ cod_collected: (cur?.cod_collected || 0) + amount }).eq("id", id);
    if (error) throw error;
  },

  // ORDERS
  async createOrder({ userId, warungId, courierId, customerName, customerPhone, dusun, address, foodTotal, ongkir, total, paymentType, dpAmount, dpPaid }) {
    const dpDeadline = paymentType === "DP" && !dpPaid ? new Date(Date.now() + DP_WINDOW_SEC * 1000).toISOString() : null;
    const { data, error } = await supabase.from("orders").insert({
      user_id: userId, warung_id: warungId, courier_id: courierId,
      customer_name: customerName, customer_phone: customerPhone,
      dusun, address, food_total: foodTotal, ongkir, total,
      payment_type: paymentType, dp_amount: dpAmount, dp_paid: dpPaid,
      dp_deadline: dpDeadline, status: "pending"
    }).select().single();
    if (error) throw error;
    return data;
  },

  async addOrderItems(orderId, items) {
    const rows = items.map(it => ({
      order_id: orderId, menu_id: it.menuId, menu_name: it.name, price: it.price, qty: it.qty
    }));
    const { error } = await supabase.from("order_items").insert(rows);
    if (error) throw error;
  },

  async updateOrderStatus(orderId, status) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) throw error;
  },

  async confirmDP(orderId) {
    const { error } = await supabase.from("orders").update({ dp_paid: true, dp_deadline: null }).eq("id", orderId);
    if (error) throw error;
  },

  async getOrdersForUser(userId) {
    const { data, error } = await supabase.from("orders")
      .select(`*, order_items(*)`)
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getPendingOrders() {
    const { data, error } = await supabase.from("orders")
      .select(`*, order_items(*), warungs(name,dusun,emoji)`)
      .in("status", ["pending","accepted","delivering"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getOrdersForWarung(warungId) {
    const { data, error } = await supabase.from("orders")
      .select(`*, order_items(*)`)
      .eq("warung_id", warungId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data;
  },

  // TRUST SCORE
  async addTrust(userId, delta) {
    const { data: u } = await supabase.from("users").select("trust_score,cancel_count,fail_count").eq("id", userId).single();
    if (!u) return;
    const updates = { trust_score: (u.trust_score || 0) + delta };
    if (delta < 0) {
      updates.cancel_count = (u.cancel_count || 0) + 1;
      if (updates.cancel_count >= BLOCK_ON_FAIL) updates.blocked = true;
    }
    await supabase.from("users").update(updates).eq("id", userId);
  },

  // AUTO CANCEL EXPIRED DP ORDERS
  async cancelExpiredDPOrders() {
    const now = new Date().toISOString();
    const { data } = await supabase.from("orders")
      .select("id,user_id").eq("status", "pending").eq("payment_type", "DP").eq("dp_paid", false).lt("dp_deadline", now);
    if (!data || !data.length) return [];
    for (const o of data) {
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
      if (o.user_id) await api.addTrust(o.user_id, -2);
    }
    return data;
  },
};

// ─────────────────────────────────────────────────────────────────────
// CART DRAWER
// ─────────────────────────────────────────────────────────────────────
function CartDrawer({ open, onClose, cart, menus, warung, onQty, onCheckout }) {
  const items   = menus.filter(m => cart[m.id] > 0);
  const total   = items.reduce((s, m) => s + cart[m.id] * m.price, 0);
  const count   = Object.values(cart).reduce((s, v) => s + v, 0);
  return (
    <>
      <div className={`co ${open ? "open" : ""}`} onClick={onClose}/>
      <div className={`cd ${open ? "open" : ""}`}>
        <div className="cdh"/>
        <div className="cdhd">
          <div className="cdtitle">🛒 Keranjang {count > 0 ? `(${count})` : ""}</div>
          <button className="cdc" onClick={onClose}>✕</button>
        </div>
        <div className="cdbody">
          {items.length === 0 ? (
            <div className="empty" style={{ padding: "40px 20px" }}>
              <div className="eico">🛒</div><h3>Keranjang kosong</h3>
              <p>Tambah makanan dari menu warung</p>
            </div>
          ) : (
            <>
              <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:12,color:"var(--t3)",marginBottom:8 }}>
                🏪 {warung?.name}
              </div>
              {items.map(m => (
                <div key={m.id} className="cir">
                  <div className="ciico">{m.emoji}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:13 }}>{m.name}</div>
                    <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:13,color:"var(--p)" }}>{fmt(m.price)}</div>
                  </div>
                  <div className="qwrap">
                    <button className="qbtn m" onClick={() => onQty(m.id, cart[m.id] - 1)}>−</button>
                    <span className="qn">{cart[m.id]}</span>
                    <button className="qbtn" disabled={cart[m.id] >= MAX_QTY_ITEM} onClick={() => onQty(m.id, cart[m.id] + 1)}>+</button>
                  </div>
                </div>
              ))}
              <div style={{ borderTop:"1.5px dashed var(--bd)",paddingTop:12,marginTop:6,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontFamily:"Nunito",fontWeight:700,fontSize:14,color:"var(--t2)" }}>Total Makanan</span>
                <span style={{ fontFamily:"Nunito",fontWeight:900,fontSize:20,color:"var(--p)" }}>{fmt(total)}</span>
              </div>
              <div style={{ fontSize:11,color:"var(--t3)",marginTop:3 }}>+Ongkir dihitung saat checkout</div>
            </>
          )}
        </div>
        {items.length > 0 && (
          <div className="cdfoot">
            <button className="btn bpri" onClick={() => { onClose(); onCheckout(); }}>
              Pesan Sekarang · {fmt(total)} →
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DP PAYMENT WIDGET
// ─────────────────────────────────────────────────────────────────────
function DPBox({ dpAmt, total, reason, onPaid, onCancel, orderId }) {
  const [method, setMethod] = useState("bri");
  const [done, setDone]     = useState(false);
  const [sec, setSec]       = useState(DP_WINDOW_SEC);
  const remaining = total - dpAmt;

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setSec(s => {
      if (s <= 1) { clearInterval(t); onCancel("timeout"); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [done]);

  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");

  const handlePay = async () => {
    setDone(true);
    if (orderId) {
      await api.confirmDP(orderId).catch(() => {});
    }
    onPaid();
  };

  return (
    <div>
      <div className={`tbar ${sec < 120 ? "urg" : ""}`}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:22 }}>⏱️</span>
          <div><div className="ttitle">Batas Waktu DP</div><div className="tsub">Bayar sebelum waktu habis</div></div>
        </div>
        <div className="tval">{mm}:{ss}</div>
      </div>
      <div className="dpbox">
        <div style={{ display:"flex",alignItems:"flex-start",gap:11,marginBottom:12 }}>
          <div style={{ width:42,height:42,borderRadius:12,background:"var(--ac)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0 }}>🛡️</div>
          <div><div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:15 }}>Down Payment Diperlukan</div><div style={{ fontSize:12,color:"var(--t2)",marginTop:3,lineHeight:1.5 }}>{reason}</div></div>
        </div>
        <div className="dpamts">
          <div className="dpab"><div className="dpal">DP Sekarang (50%)</div><div className="dpav" style={{ color:"var(--ac)" }}>{fmt(dpAmt)}</div></div>
          <div className="dpab"><div className="dpal">Sisa COD ke Kurir</div><div className="dpav">{fmt(remaining)}</div></div>
        </div>
        <div style={{ fontSize:12,fontWeight:600,color:"var(--t2)",marginBottom:8 }}>Pilih metode:</div>
        <div className="dpms">
          {[{ id:"bri",ico:"🏦",lbl:"BRI" },{ id:"gopay",ico:"💚",lbl:"GoPay" },{ id:"ovo",ico:"💜",lbl:"OVO" },{ id:"dana",ico:"💙",lbl:"DANA" }].map(m => (
            <div key={m.id} className={`dpm ${method === m.id ? "on" : ""}`} onClick={() => setMethod(m.id)}>
              <div className="dpmi">{m.ico}</div><div className="dpml">{m.lbl}</div>
            </div>
          ))}
        </div>
        {method === "bri" && (
          <div className="bankbox">
            {[["No. Rekening","1234-5678-9012-3456"],["Atas Nama","KotarajaFood"],["Jumlah",fmt(dpAmt)]].map(([l,v]) => (
              <div key={l} className="brow"><span style={{ color:"var(--t3)" }}>{l}</span><span style={{ fontWeight:700,color:l==="Jumlah"?"var(--ac)":"var(--t)" }}>{v}</span></div>
            ))}
          </div>
        )}
        <div style={{ display:"flex",gap:8 }}>
          <button className="btn bsec bsm" style={{ flex:1 }} onClick={() => onCancel("user")}>Batal</button>
          <button className="btn byel bsm" style={{ flex:2,background:done?"var(--gn)":"var(--ac)" }} onClick={handlePay}>
            {done ? "✅ Dikonfirmasi!" : "✅ Saya Sudah Bayar DP"}
          </button>
        </div>
        <div style={{ marginTop:10,fontSize:11,color:"var(--t3)",textAlign:"center" }}>
          Sisa {fmt(remaining)} dibayar tunai ke kurir saat pesanan tiba
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AUTH PAGE
// ─────────────────────────────────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [name,  setName]  = useState("");
  const [phone, setPhone] = useState("");
  const [role,  setRole]  = useState("customer");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const roles = [
    { id:"customer",ico:"👤",lbl:"Pelanggan" },
    { id:"warung",  ico:"🏪",lbl:"Pemilik Warung" },
    { id:"courier", ico:"🛵",lbl:"Kurir" },
    { id:"admin",   ico:"🏢",lbl:"Admin" },
  ];

  const login = async () => {
    if (!name.trim()) { setErr("Masukkan nama kamu"); return; }
    if (!phone.trim()) { setErr("Masukkan nomor WhatsApp"); return; }
    setLoading(true); setErr("");
    try {
      const user = await api.getOrCreateUser(name.trim(), phone.trim(), role);
      onLogin(user);
    } catch (e) {
      setErr("Gagal masuk. Cek koneksi internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authwrap">
      <div className="auth-logo">Kotaraja<em>Food</em></div>
      <div style={{ fontSize:28,marginBottom:6 }}>🛵</div>
      <div className="auth-sub">Pesan makanan dari warung<br/>favoritmu di Kotaraja</div>
      <div className="auth-form">
        <div className="fg">
          <label className="fl">👤 Nama Kamu</label>
          <input className="fi" placeholder="Masukkan nama lengkap..." value={name} onChange={e => setName(e.target.value)}/>
        </div>
        <div className="fg">
          <label className="fl">📱 Nomor WhatsApp</label>
          <input className="fi" type="tel" placeholder="08xx-xxxx-xxxx" value={phone} onChange={e => setPhone(e.target.value)}/>
        </div>
        <div className="fg">
          <label className="fl">Saya adalah...</label>
          <div className="rol-opts">
            {roles.map(r => (
              <div key={r.id} className={`rol-opt ${role === r.id ? "on" : ""}`} onClick={() => setRole(r.id)}>
                <div className="rol-ico">{r.ico}</div>
                <div className="rol-lbl">{r.lbl}</div>
              </div>
            ))}
          </div>
        </div>
        {err && <div className="nbox rd" style={{ marginBottom:12 }}><span style={{ fontSize:16 }}>⚠️</span><div className="nip">{err}</div></div>}
        <button className="btn bpri" onClick={login} disabled={loading}>
          {loading ? "⏳ Masuk..." : "Masuk ke KotarajaFood →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────────
const CATS = [
  {id:"all",n:"Semua",e:"🍽️"},{id:"Takoyaki",n:"Takoyaki",e:"🐙"},{id:"Bakso",n:"Bakso",e:"🍜"},
  {id:"Pentol",n:"Pentol",e:"🍡"},{id:"Sate",n:"Sate",e:"🍢"},{id:"Nasi Goreng",n:"Nasi",e:"🍳"},
  {id:"Rujak",n:"Rujak",e:"🥗"},{id:"Minuman",n:"Minuman",e:"🧋"},
];

function HomePage({ user, warungs, loading, cartCount, onWarung, onCartOpen }) {
  const [cat, setCat] = useState("all");
  const [q,   setQ]   = useState("");
  const tier = getTier(user.trust_score || 0);
  const stars = Math.min(5, Math.max(0, Math.floor(((user.trust_score || 0) + 1) / 2)));

  const filtered = warungs.filter(w =>
    w.name.toLowerCase().includes(q.toLowerCase()) || w.dusun.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div className="hdr">
        <div className="hrow">
          <div>
            <div className="logo">Kotaraja<em>Food</em></div>
            <div className="hloc">📍 Kotaraja, Sikur, Lombok Timur</div>
          </div>
          <button className="ibtn" onClick={onCartOpen} style={{ position:"relative" }}>
            🛒{cartCount > 0 && <div className="cbdg">{cartCount}</div>}
          </button>
        </div>
        <div className="thead-pill">
          <div style={{ display:"flex",gap:1 }}>
            {[0,1,2,3,4].map(i => <span key={i} className={`ts ${i < stars ? "on" : ""}`}>⭐</span>)}
          </div>
          <span style={{ fontSize:11,color:"rgba(255,255,255,.8)",fontFamily:"Nunito",fontWeight:700,flex:1 }}>{tier.label}</span>
          <span style={{ fontSize:12,fontFamily:"Nunito",fontWeight:900,color:"#fff" }}>Skor {user.trust_score || 0}</span>
        </div>
        <div className="sbox">
          <span className="sico">🔍</span>
          <input className="sinp" placeholder="Cari warung atau makanan..." value={q} onChange={e => setQ(e.target.value)}/>
        </div>
      </div>

      {/* Alerts */}
      {user.blocked && (
        <div style={{ padding:"10px 16px 0" }}>
          <div className="nbox rd"><span style={{ fontSize:18 }}>🚫</span><div><div className="nit rd">Akun Diblokir Sementara</div><div className="nip">Terlalu banyak pesanan gagal. Hubungi admin.</div></div></div>
        </div>
      )}
      {!user.blocked && (user.cancel_count || 0) >= FORCE_DP_CANCEL && (
        <div style={{ padding:"10px 16px 0" }}>
          <div className="nbox yl"><span style={{ fontSize:18 }}>⚠️</span><div><div className="nit yl">DP Wajib Aktif</div><div className="nip">Semua pesanan memerlukan DP karena ada riwayat {user.cancel_count}× pembatalan.</div></div></div>
        </div>
      )}
      {!user.blocked && (user.trust_score || 0) < MIN_TRUST_COD && !(user.cancel_count) && (
        <div style={{ padding:"10px 16px 0" }}>
          <div className="nbox bl"><span style={{ fontSize:18 }}>🌱</span><div><div className="nit bl">Pengguna Baru</div><div className="nip">Selesaikan {MIN_TRUST_COD - (user.trust_score||0)} pesanan untuk buka COD penuh. Maks {MAX_ITEM_TYPES} jenis menu per order.</div></div></div>
        </div>
      )}

      <div className="bnr">
        <div>
          <div className="bnrt">Gratis Ongkir<br/>Sesama Dusun! 🎉</div>
          <div className="bnrs">Antar dusun cuma Rp 5.000</div>
        </div>
        <div className="bnri">🛵</div>
      </div>

      <div className="hscr">
        {CATS.map(c => (
          <div key={c.id} className={`cat ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)}>
            <span className="cico">{c.e}</span><span className="clbl">{c.n}</span>
          </div>
        ))}
      </div>

      <div className="sec">
        <div className="sechd">
          <span>Warung Buka</span>
          <span style={{ fontSize:11,fontWeight:700,color:"var(--p)" }}>
            <span className="rtdot"/> Live · {filtered.length} warung
          </span>
        </div>
        {loading ? <Spinner/> : filtered.length === 0 ? (
          <div className="empty"><div className="eico">🔍</div><h3>Tidak ditemukan</h3><p>Coba kata kunci lain</p></div>
        ) : filtered.map(w => (
          <div key={w.id} className="wcard" onClick={() => onWarung(w)}>
            <div className="wimg">{w.emoji || "🏪"}<div className="wopen"><span className={`bdg ${w.is_open ? "bg" : "by"}`}>{w.is_open ? "🟢 Buka" : "🔴 Tutup"}</span></div></div>
            <div className="wbody">
              <div className="wname">{w.name}</div>
              <div className="wrow"><span className="wmeta">📍 {w.dusun}</span><span className="wmeta"> · ⏰ {w.hours}</span></div>
              <div className="wlmk">📌 {w.landmark}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WARUNG PAGE
// ─────────────────────────────────────────────────────────────────────
function WarungPage({ warung, menus, menusLoading, cart, onQty, onBack, onCartOpen, user }) {
  const [mcat, setMcat] = useState("Semua");
  const cats     = ["Semua", ...new Set(menus.map(m => m.category))];
  const filtered = mcat === "Semua" ? menus : menus.filter(m => m.category === mcat);
  const cartCount = Object.values(cart).reduce((s, v) => s + v, 0);
  const cartTotal = menus.reduce((s, m) => s + (cart[m.id] || 0) * m.price, 0);
  const uniqueTypes = Object.keys(cart).filter(k => cart[k] > 0).length;
  const isNew = (user.trust_score || 0) < MIN_TRUST_COD;
  const atTypeLimit = isNew && uniqueTypes >= MAX_ITEM_TYPES;

  const tryAdd = id => { if ((cart[id] || 0) === 0 && atTypeLimit) return; onQty(id, (cart[id] || 0) + 1); };

  return (
    <div>
      <div className="hdr">
        <div className="hrow">
          <button className="ibtn" onClick={onBack}>←</button>
          <div className="logo" style={{ flex:1,textAlign:"center",fontSize:17 }}>{warung.name}</div>
          <button className="ibtn" onClick={onCartOpen} style={{ position:"relative" }}>
            🛒{cartCount > 0 && <div className="cbdg">{cartCount}</div>}
          </button>
        </div>
      </div>

      <div style={{ padding:"0 16px" }}>
        <div style={{ background:"linear-gradient(135deg,#F5EDE0,#EAD5BB)",borderRadius:16,height:150,display:"flex",alignItems:"center",justifyContent:"center",fontSize:72,margin:"12px 0" }}>{warung.emoji || "🏪"}</div>
        <div className="irow"><span className="iico">📍</span><span>{warung.dusun} · {warung.landmark}</span></div>
        <div className="irow"><span className="iico">⏰</span><span>{warung.hours} · <span className={`bdg ${warung.is_open ? "bg" : "by"}`}>{warung.is_open ? "Buka" : "Tutup"}</span></span></div>
        <div className="irow"><span className="iico">💳</span><span>COD · Ongkir Rp 3.000 (sesama) – Rp 5.000 (beda dusun)</span></div>
      </div>

      {isNew && <div style={{ padding:"8px 16px 0" }}>
        <div className="limbar">
          <span>🌱 Maks {MAX_ITEM_TYPES} jenis menu & {MAX_QTY_ITEM} qty/item</span>
          <span style={{ fontWeight:900,flexShrink:0 }}>{uniqueTypes}/{MAX_ITEM_TYPES}</span>
        </div>
      </div>}

      <div className="div"/>
      <div style={{ padding:"0 16px 12px" }}>
        <div className="sechd" style={{ marginBottom:8 }}>Menu</div>
        <div className="chips">{cats.map(c => <div key={c} className={`chip ${mcat === c ? "on" : ""}`} onClick={() => setMcat(c)}>{c}</div>)}</div>
        {menusLoading ? <Spinner/> : filtered.map(m => {
          const q = cart[m.id] || 0;
          return (
            <div key={m.id} className="mi">
              <div className="mimg">{m.emoji}</div>
              <div className="mdet">
                <div className="mn">{m.name}</div>
                <div className="md">{m.description}</div>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:5 }}>
                  <div className="mp">{fmt(m.price)}</div>
                  {q >= MAX_QTY_ITEM && <span className="bdg by" style={{ fontSize:9 }}>Maks</span>}
                </div>
              </div>
              {q === 0 ? (
                <button className="addbtn" disabled={atTypeLimit && q === 0} onClick={() => tryAdd(m.id)}>+</button>
              ) : (
                <div className="qwrap">
                  <button className="qbtn m" onClick={() => onQty(m.id, q - 1)}>−</button>
                  <span className="qn">{q}</span>
                  <button className="qbtn" disabled={q >= MAX_QTY_ITEM} onClick={() => onQty(m.id, q + 1)}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <div style={{ position:"sticky",bottom:80,padding:"0 16px 12px" }}>
          <button className="btn bpri" onClick={onCartOpen} style={{ boxShadow:"0 6px 24px rgba(232,67,10,.4)" }}>
            🛒 Keranjang ({cartCount}) · {fmt(cartTotal)}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CHECKOUT PAGE
// ─────────────────────────────────────────────────────────────────────
function CheckoutPage({ warung, menus, cart, user, onBack, onSuccess, showToast }) {
  const cartItems  = menus.filter(m => cart[m.id] > 0);
  const foodTotal  = cartItems.reduce((s, m) => s + cart[m.id] * m.price, 0);
  const [name,    setName]    = useState(user.name);
  const [phone,   setPhone]   = useState(user.phone || "");
  const [dusun,   setDusun]   = useState("");
  const [addr,    setAddr]    = useState("");
  const [step,    setStep]    = useState("form"); // form | dp
  const [loading, setLoading] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState(null);

  const ongkir   = getOngkir(warung?.dusun, dusun);
  const grandTotal  = foodTotal + (ongkir || 0);
  const protection  = dusun ? evalProtection(user, grandTotal) : { requireDP:false, dpAmt:0, reason:"", blocked:false };

  if (user.blocked) {
    return (
      <div className="blockwrap">
        <div className="blockico">🚫</div>
        <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:22,color:"var(--rd)",marginBottom:8 }}>Akun Diblokir</div>
        <div style={{ fontSize:14,color:"var(--t2)",maxWidth:280,lineHeight:1.6,marginBottom:20,textAlign:"center" }}>
          Akunmu diblokir karena {user.fail_count || 0}× pesanan gagal. Hubungi admin.
        </div>
        <div className="nbox rd" style={{ width:"100%",marginBottom:16 }}>
          <span style={{ fontSize:18 }}>📞</span>
          <div><div className="nit rd">Hubungi Admin</div><div className="nip">WA: 0811-1234-5678</div></div>
        </div>
        <button className="btn" style={{ background:"var(--t2)",color:"#fff" }} onClick={onBack}>← Kembali</button>
      </div>
    );
  }

  const doSubmit = async () => {
    if (!name || !phone || !dusun || !addr) { showToast("⚠️ Lengkapi semua data dulu!"); return; }
    setLoading(true);
    try {
      // Find courier
      const courier = await api.getFirstOnlineCourier();
      const paymentType = protection.requireDP ? "DP" : "COD";

      // Create order
      const order = await api.createOrder({
        userId: user.id, warungId: warung.id, courierId: courier?.id || null,
        customerName: name, customerPhone: phone, dusun, address: addr,
        foodTotal, ongkir: ongkir || 0, total: grandTotal,
        paymentType, dpAmount: protection.requireDP ? protection.dpAmt : 0,
        dpPaid: false,
      });

      // Insert items
      const items = cartItems.map(m => ({ menuId: m.id, name: m.name, price: m.price, qty: cart[m.id] }));
      await api.addOrderItems(order.id, items);

      if (protection.requireDP) {
        setCreatedOrderId(order.id);
        setLoading(false);
        setStep("dp");
      } else {
        setLoading(false);
        onSuccess(order);
      }
    } catch (e) {
      setLoading(false);
      showToast("❌ Gagal membuat pesanan. Cek koneksi.");
    }
  };

  const handleDPPaid = async () => {
    try {
      if (createdOrderId) await api.confirmDP(createdOrderId);
      const orderData = { id: createdOrderId, customer_name: name, customer_phone: phone, dusun, address: addr, total: grandTotal, ongkir, food_total: foodTotal, dp_paid: true, dp_amount: protection.dpAmt };
      onSuccess(orderData);
    } catch { showToast("❌ Gagal konfirmasi DP"); }
  };

  const handleDPCancel = async (reason) => {
    if (reason === "timeout") {
      if (createdOrderId) await api.updateOrderStatus(createdOrderId, "cancelled").catch(() => {});
      if (user.id) await api.addTrust(user.id, -2).catch(() => {});
      showToast("⏱️ Waktu habis! Pesanan dibatalkan.");
      onBack();
    } else {
      if (createdOrderId) await api.updateOrderStatus(createdOrderId, "cancelled").catch(() => {});
      setStep("form");
    }
  };

  return (
    <div>
      <div className="hdrw">
        <div className="hrow">
          <button className="ibtn dk" onClick={step === "dp" ? () => setStep("form") : onBack}>←</button>
          <div className="htitle" style={{ flex:1,textAlign:"center" }}>{step === "dp" ? "Bayar DP" : "Checkout"}</div>
          <div style={{ width:38 }}/>
        </div>
      </div>
      <div style={{ padding:16 }}>
        {step === "dp" ? (
          <DPBox dpAmt={protection.dpAmt} total={grandTotal} reason={protection.reason} onPaid={handleDPPaid} onCancel={handleDPCancel} orderId={createdOrderId}/>
        ) : (
          <>
            <div className="card">
              <div className="ctitle" style={{ marginBottom:10 }}>📋 Ringkasan Pesanan</div>
              <div style={{ fontSize:12,color:"var(--t3)",fontFamily:"Nunito",fontWeight:700,marginBottom:8 }}>🛵 {warung?.name}</div>
              {cartItems.map(m => (
                <div key={m.id} style={{ display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",color:"var(--t2)",borderBottom:"1px dashed var(--bd)" }}>
                  <span>{m.name} <span style={{ color:"var(--t3)" }}>×{cart[m.id]}</span></span>
                  <span style={{ fontWeight:700 }}>{fmt(m.price * cart[m.id])}</span>
                </div>
              ))}
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginTop:8,color:"var(--t2)" }}>
                <span>Subtotal</span><span style={{ fontWeight:800 }}>{fmt(foodTotal)}</span>
              </div>
            </div>

            <div className="fg"><label className="fl">👤 Nama Pemesan</label><input className="fi" value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap..."/></div>
            <div className="fg"><label className="fl">📱 Nomor WhatsApp</label><input className="fi" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xx..."/></div>
            <div className="fg">
              <label className="fl">📍 Dusun Tujuan</label>
              <select className="fi" value={dusun} onChange={e => setDusun(e.target.value)}>
                <option value="">Pilih dusun...</option>
                {DUSUN.map(d => <option key={d} value={d}>{d}</option>)}
                <option value="__luar">📦 Luar Desa Kotaraja (+Rp 10.000)</option>
              </select>
            </div>
            {dusun && <div style={{ background:"var(--acl)",borderRadius:10,padding:"9px 13px",marginBottom:13,fontSize:12,color:"var(--yl)",fontWeight:700 }}>🛵 Ongkir: Rp {fmt(ongkir || 0)}</div>}
            <div className="fg"><label className="fl">🏠 Alamat / Patokan</label><textarea className="fi" value={addr} onChange={e => setAddr(e.target.value)} placeholder="Contoh: Rumah cat biru depan sawah..."/></div>

            <div className="card" style={{ marginBottom:12 }}>
              <div className="ctitle" style={{ marginBottom:10 }}>💰 Rincian Pembayaran</div>
              {[["Makanan", fmt(foodTotal)],["Ongkos Kirim", ongkir !== null ? fmt(ongkir) : "—"]].map(([l,v]) => (
                <div key={l} style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6,color:"var(--t2)" }}><span>{l}</span><span style={{ fontWeight:700 }}>{v}</span></div>
              ))}
              <div style={{ borderTop:"2px solid var(--bd)",marginTop:6,paddingTop:10,display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontFamily:"Nunito",fontWeight:800,fontSize:15 }}>Total</span>
                <span style={{ fontFamily:"Nunito",fontWeight:900,fontSize:17,color:"var(--p)" }}>{ongkir !== null ? fmt(grandTotal) : "—"}</span>
              </div>
              {protection.requireDP && dusun && (
                <>
                  <div style={{ borderTop:"1px dashed var(--bd)",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between",fontSize:13,color:"var(--t2)" }}>
                    <span style={{ fontWeight:700,color:"var(--ac)" }}>DP Sekarang (50%)</span>
                    <span style={{ fontWeight:900,color:"var(--ac)" }}>{fmt(protection.dpAmt)}</span>
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--t2)",marginTop:4 }}>
                    <span>Sisa COD ke kurir</span><span style={{ fontWeight:700 }}>{fmt(grandTotal - protection.dpAmt)}</span>
                  </div>
                </>
              )}
            </div>

            {dusun && grandTotal > 0 && (
              <div style={{ marginBottom:14 }}>
                {!protection.requireDP ? (
                  <div className="nbox gn"><span style={{ fontSize:18 }}>✅</span><div><div className="nit gn">COD Diizinkan</div><div className="nip">Bayar tunai ke kurir saat pesanan tiba.</div></div></div>
                ) : (
                  <div className="nbox or"><span style={{ fontSize:18 }}>🛡️</span><div><div className="nit or">DP Diperlukan</div><div className="nip">{protection.reason}</div></div></div>
                )}
              </div>
            )}

            <div className="nbox bl" style={{ marginBottom:14 }}>
              <span style={{ fontSize:18 }}>📱</span>
              <div><div className="nit bl">Notifikasi WhatsApp</div><div className="nip">Update status pesanan dikirim ke WA {phone || "kamu"} secara otomatis.</div></div>
            </div>

            <button className="btn bpri" onClick={doSubmit} disabled={loading || !ongkir}
              style={{ background: protection.requireDP && dusun ? "var(--ac)" : "" }}>
              {loading ? "⏳ Memproses..." : !ongkir ? "Pilih dusun tujuan dulu" : protection.requireDP ? `🛡️ Lanjut Bayar DP · ${fmt(protection.dpAmt)}` : `✅ Pesan Sekarang · ${fmt(grandTotal)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SUCCESS PAGE
// ─────────────────────────────────────────────────────────────────────
function SuccessPage({ order, onHome }) {
  return (
    <div className="succwrap">
      <div className="succico">✅</div>
      <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:23,marginBottom:7 }}>Pesanan Berhasil!</div>
      <div style={{ fontSize:13,color:"var(--t2)",maxWidth:280,lineHeight:1.6,marginBottom:22,textAlign:"center" }}>
        Pesananmu sudah masuk. Kurir akan segera menjemput dan mengantarkan.
      </div>
      <div style={{ background:"var(--pl)",borderRadius:14,padding:"14px 18px",marginBottom:14,width:"100%" }}>
        <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:13,color:"var(--p)" }}>#{(order?.id||"").slice(0,8).toUpperCase()}</div>
        <div style={{ fontSize:12,color:"var(--t2)",marginTop:3 }}>📱 WA → {order?.customer_phone}</div>
        <div style={{ fontSize:12,color:"var(--t2)",marginTop:2 }}>📍 {order?.dusun} · {order?.address}</div>
        {order?.dp_paid && <div style={{ marginTop:7,background:"var(--gnl)",borderRadius:8,padding:"6px 10px",fontSize:12,color:"var(--gn)",fontWeight:700 }}>✅ DP {fmt(order.dp_amount)} sudah dikonfirmasi · Sisa {fmt((order.total||0) - (order.dp_amount||0))} ke kurir</div>}
        {!order?.dp_paid && <div style={{ fontSize:14,fontWeight:800,color:"var(--p)",marginTop:6 }}>Total COD: {fmt(order?.total)}</div>}
      </div>
      <div style={{ width:"100%",marginBottom:20 }}>
        <ProgBar steps={["Diterima","Warung\nProses","Kurir\nAmbil","Di Jalan","Sampai"]} cur={1}/>
      </div>
      <div className="nbox gn" style={{ width:"100%",marginBottom:16 }}>
        <span style={{ fontSize:18 }}>⭐</span>
        <div><div className="nit gn">Skor +1 saat selesai!</div><div className="nip">Setiap pesanan berhasil diantar, skor kepercayaanmu bertambah.</div></div>
      </div>
      <button className="btn bpri" onClick={onHome}>🏠 Kembali ke Beranda</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ORDERS PAGE (customer)
// ─────────────────────────────────────────────────────────────────────
function OrdersPage({ user, showToast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await api.getOrdersForUser(user.id);
      setOrders(data || []);
    } catch { showToast("❌ Gagal memuat pesanan"); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel("orders-customer")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id, load]);

  const doCancel = async id => {
    try {
      await api.updateOrderStatus(id, "cancelled");
      await api.addTrust(user.id, -2);
      showToast("✕ Pesanan dibatalkan · Skor -2");
      load();
    } catch { showToast("❌ Gagal membatalkan"); }
  };

  const active = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const done   = orders.filter(o =>  ["completed","cancelled"].includes(o.status));
  const list   = tab === "active" ? active : done;

  return (
    <div>
      <div className="hdrw">
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div className="htitle">Pesanan Saya</div>
          <span className="rtdot"/>
        </div>
      </div>
      <div style={{ padding:"0 16px" }}>
        <div className="tabs" style={{ marginTop:12 }}>
          <div className={`tab ${tab==="active"?"on":""}`} onClick={() => setTab("active")}>Aktif ({active.length})</div>
          <div className={`tab ${tab==="done"?"on":""}`} onClick={() => setTab("done")}>Riwayat ({done.length})</div>
        </div>
        {loading ? <Spinner/> : list.length === 0 ? (
          <div className="empty"><div className="eico">📭</div><h3>Belum ada pesanan</h3><p>Yuk pesan makanan favoritmu!</p></div>
        ) : list.map(o => (
          <div key={o.id} className="card">
            <div className="chd">
              <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div>
              <StatusBadge s={o.status}/>
            </div>
            {o.status === "delivering" && <ProgBar steps={ORDER_STEPS} cur={statusStep[o.status] || 0}/>}
            <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:14 }}>{o.warungs?.name || "Warung"}</div>
            <div style={{ fontSize:12,color:"var(--t2)",marginTop:2 }}>
              {(o.order_items || []).map(i => `${i.menu_name} ×${i.qty}`).join(", ")}
            </div>
            <div style={{ fontSize:11,color:"var(--t3)",marginTop:3 }}>📍 {o.dusun} · {o.address}</div>
            {o.dp_paid && <div style={{ fontSize:11,color:"var(--gn)",fontWeight:700,marginTop:4 }}>✅ DP {fmt(o.dp_amount)} sudah dibayar</div>}
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,paddingTop:9,borderTop:"1px solid var(--bd)" }}>
              <div>
                <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:15,color:"var(--p)" }}>{fmt(o.total)}</div>
                <div style={{ fontSize:10,color:"var(--t3)" }}>Ongkir {fmt(o.ongkir)}</div>
              </div>
              {o.status === "pending" && (
                <button className="btn brd2 bsm" onClick={() => doCancel(o.id)}>Batalkan</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PROFILE PAGE
// ─────────────────────────────────────────────────────────────────────
function ProfilePage({ user, onLogout }) {
  const tier  = getTier(user.trust_score || 0);
  const stars = Math.min(5, Math.max(0, Math.floor(((user.trust_score||0)+1)/2)));

  return (
    <div>
      <div className="hdrw"><div className="htitle">Profil & Kepercayaan</div></div>
      <div style={{ padding:16 }}>
        <div className="tcard">
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10 }}>
            <div style={{ flex:1 }}>
              <div className="ttier">{tier.label}</div>
              <div style={{ fontSize:11,color:"rgba(255,255,255,.72)",marginBottom:12 }}>{user.name} · {user.role}</div>
              <div className="tmeter"><div className="tmfill" style={{ width:`${tier.pct}%` }}/></div>
              <div className="trow"><span>0</span><span>COD Bebas (≥2)</span><span>VIP (≥10)</span></div>
            </div>
            <div className="tscore-pill">
              <div className="tscore-num">{user.trust_score || 0}</div>
              <div className="tscore-lbl">Skor</div>
            </div>
          </div>
          {(user.cancel_count || 0) > 0 && (
            <div style={{ marginTop:10,background:"rgba(220,38,38,.15)",borderRadius:8,padding:"7px 10px",fontSize:11,color:"#FCA5A5",fontWeight:700,fontFamily:"Nunito" }}>
              ⚠️ {user.cancel_count}× pembatalan tercatat {(user.cancel_count||0) >= FORCE_DP_CANCEL ? "— DP wajib untuk semua pesanan" : ""}
            </div>
          )}
        </div>

        <div className="card">
          <div className="ctitle" style={{ marginBottom:12 }}>🛡️ Aturan Sistem Proteksi</div>
          {[
            ["✅ COD Bebas",      "Skor ≥ 2 dan order < Rp 50.000","var(--gnl)","var(--gn)"],
            ["🛡️ Wajib DP 50%",  "Order ≥ Rp 50.000 atau skor < 2","var(--acl)","var(--yl)"],
            ["⚠️ DP Paksa Semua","Setelah 2× pembatalan",           "var(--yll)","var(--yl)"],
            ["🚫 Blokir 24 Jam", "Setelah 3× pesanan gagal",        "var(--rdl)","var(--rd)"],
            ["⭐ Skor +1",        "Setiap pesanan berhasil selesai", "var(--gnl)","var(--gn)"],
            ["💔 Skor −2",        "Setiap pesanan dibatal / gagal",  "var(--rdl)","var(--rd)"],
          ].map(([t,d,bg,c]) => (
            <div key={t} style={{ display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--bd)" }}>
              <span style={{ background:bg,color:c,borderRadius:8,padding:"5px 9px",fontSize:11,fontWeight:700,fontFamily:"Nunito",flexShrink:0,alignSelf:"flex-start" }}>{t}</span>
              <span style={{ fontSize:12,color:"var(--t2)",alignSelf:"center",lineHeight:1.4 }}>{d}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom:10 }}>
          <div className="ctitle" style={{ marginBottom:10 }}>👤 Info Akun</div>
          {[["Nama",user.name],["WA",user.phone||"—"],["Role",user.role],["Skor",user.trust_score||0],["Pembatalan",(user.cancel_count||0)+"×"]].map(([l,v])=>(
            <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--bd)",fontSize:13 }}><span style={{ color:"var(--t2)" }}>{l}</span><span style={{ fontWeight:700 }}>{v}</span></div>
          ))}
        </div>

        <button className="btn" style={{ background:"var(--t2)",color:"#fff" }} onClick={onLogout}>
          Keluar dari Akun
        </button>
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COURIER PAGE
// ─────────────────────────────────────────────────────────────────────
function CourierPage({ user, showToast }) {
  const [orders,   setOrders]   = useState([]);
  const [courier,  setCourier]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("active");

  const loadCourier = useCallback(async () => {
    const { data } = await supabase.from("couriers").select("*").eq("user_id", user.id).maybeSingle();
    if (data) setCourier(data);
  }, [user.id]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPendingOrders();
      setOrders(data || []);
    } catch { showToast("❌ Gagal memuat pesanan"); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCourier(); loadOrders(); }, [loadCourier, loadOrders]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel("courier-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadOrders)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loadOrders]);

  const cod = orders.filter(o => o.status === "completed" && o.courier_id === courier?.id)
    .reduce((s, o) => s + (o.dp_paid ? o.total - o.dp_amount : o.total), 0);

  const accept = async id => {
    await api.updateOrderStatus(id, "accepted");
    showToast("✅ Order diterima!");
  };
  const startDeliver = async id => {
    await api.updateOrderStatus(id, "delivering");
    showToast("🛵 Sedang dalam perjalanan…");
  };
  const complete = async (o) => {
    await api.updateOrderStatus(o.id, "completed");
    const collected = o.dp_paid ? o.total - o.dp_amount : o.total;
    if (courier?.id) await api.addCourierCOD(courier.id, collected);
    if (o.user_id) await api.addTrust(o.user_id, 1);
    showToast(`💰 Selesai! COD ${fmt(collected)} diterima · Customer +1 skor`);
  };

  const pending  = orders.filter(o => o.status === "pending");
  const active   = orders.filter(o => ["accepted","delivering"].includes(o.status) && o.courier_id === courier?.id);
  const done     = orders.filter(o => o.status === "completed" && o.courier_id === courier?.id);

  return (
    <div>
      <div className="hdr">
        <div className="hrow">
          <div>
            <div className="logo">Kurir <em>Dashboard</em></div>
            <div className="hloc">🛵 {user.name} <span className="rtdot" style={{ marginLeft:4 }}/> Live</div>
          </div>
          <div style={{ background:"rgba(255,255,255,.15)",borderRadius:11,padding:"8px 12px",textAlign:"right" }}>
            <div style={{ fontSize:9,color:"rgba(255,255,255,.65)",fontFamily:"Nunito",fontWeight:700,textTransform:"uppercase" }}>COD Terkumpul</div>
            <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:16,color:"#fff" }}>{fmt(cod)}</div>
          </div>
        </div>
      </div>
      <div style={{ padding:16 }}>
        <div className="sgrid">
          <div className="st"><div className="sl">Order Baru</div><div className="sv r">{pending.length}</div></div>
          <div className="st"><div className="sl">Sedang Jalan</div><div className="sv">{active.length}</div></div>
          <div className="st"><div className="sl">Selesai</div><div className="sv g">{done.length}</div></div>
          <div className="st"><div className="sl">COD</div><div className="sv s">{fmt(cod)}</div></div>
        </div>

        <div className="tabs">
          <div className={`tab ${tab==="active"?"on":""}`} onClick={()=>setTab("active")}>Aktif</div>
          <div className={`tab ${tab==="new"?"on":""}`} onClick={()=>setTab("new")}>Baru ({pending.length})</div>
          <div className={`tab ${tab==="done"?"on":""}`} onClick={()=>setTab("done")}>Selesai</div>
        </div>

        {loading ? <Spinner/> : (
          <>
            {tab === "new" && pending.map(o => (
              <div key={o.id} className="co-card new">
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                  <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div>
                  <StatusBadge s={o.status}/>
                </div>
                {o.dp_paid && (
                  <div className="nbox gn" style={{ margin:"0 0 8px",padding:"8px 11px" }}>
                    <span style={{ fontSize:14 }}>🛡️</span>
                    <div><div className="nit gn" style={{ fontSize:11 }}>DP {fmt(o.dp_amount)} verified</div><div className="nip">Pesanan aman — DP sudah dibayar.</div></div>
                  </div>
                )}
                <div style={{ fontWeight:700,fontSize:13,fontFamily:"Nunito" }}>🏪 {o.warungs?.name} ({o.warungs?.dusun})</div>
                <div style={{ background:"var(--pll)",borderRadius:9,padding:"9px 11px",marginTop:8 }}>
                  <div style={{ fontSize:12,fontWeight:700,color:"var(--t2)" }}>🏠 {o.dusun}</div>
                  <div style={{ fontSize:12,color:"var(--t2)",marginTop:1 }}>{o.address}</div>
                  <div style={{ fontSize:11,color:"var(--t3)",marginTop:2 }}>📱 {o.customer_phone}</div>
                </div>
                <div style={{ marginTop:8,height:100,background:"linear-gradient(135deg,#EBF4FF,#DBEAFE)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,fontSize:12,color:"var(--bl)",fontWeight:700,cursor:"pointer",border:"2px dashed #93C5FD" }}
                  onClick={() => showToast("📍 GPS: -8.593, 116.421")}>
                  <span style={{ fontSize:26 }}>🗺️</span><span>Tap untuk lihat lokasi</span>
                </div>
                <div style={{ display:"flex",gap:8,marginTop:8,alignItems:"center" }}>
                  <div style={{ flex:1,background:"var(--pl)",borderRadius:10,padding:"9px 10px",textAlign:"center" }}>
                    <div style={{ fontSize:9,color:"var(--t3)",fontWeight:700,fontFamily:"Nunito" }}>COD TAGIH</div>
                    <div style={{ fontFamily:"Nunito",fontWeight:900,color:"var(--p)",fontSize:15 }}>{fmt(o.dp_paid ? o.total - o.dp_amount : o.total)}</div>
                  </div>
                  <button className="btn bpri bsm" style={{ flex:2 }} onClick={() => accept(o.id)}>✅ Terima Order</button>
                </div>
              </div>
            ))}

            {tab === "active" && active.length === 0 && (
              <div className="empty"><div className="eico">🛵</div><h3>Tidak ada order aktif</h3><p>Terima pesanan baru dari tab "Baru"</p></div>
            )}
            {tab === "active" && active.map(o => (
              <div key={o.id} className="co-card active">
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                  <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div>
                  <StatusBadge s={o.status}/>
                </div>
                <ProgBar steps={["Diterima","Proses","Ambil","Di Jalan","Sampai"]} cur={statusStep[o.status]||0}/>
                <div style={{ fontWeight:700,fontSize:13,fontFamily:"Nunito" }}>🏪 {o.warungs?.name}</div>
                <div style={{ fontSize:12,color:"var(--t2)",marginTop:3 }}>🏠 {o.dusun} · {o.address}</div>
                <div style={{ fontSize:11,color:"var(--t3)",marginTop:2 }}>📱 {o.customer_phone}</div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,paddingTop:9,borderTop:"1px solid var(--bd)" }}>
                  <div>
                    <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:15,color:"var(--p)" }}>
                      COD: {fmt(o.dp_paid ? o.total - o.dp_amount : o.total)}
                    </div>
                    {o.dp_paid && <div style={{ fontSize:10,color:"var(--gn)" }}>DP {fmt(o.dp_amount)} sudah dibayar</div>}
                  </div>
                  {o.status === "accepted"
                    ? <button className="btn byel bsm" onClick={() => startDeliver(o.id)}>🛵 Mulai Antar</button>
                    : <button className="btn bgrn bsm" onClick={() => complete(o)}>✅ Sudah Sampai</button>
                  }
                </div>
              </div>
            ))}

            {tab === "done" && done.length === 0 && (
              <div className="empty"><div className="eico">✅</div><h3>Belum ada selesai hari ini</h3></div>
            )}
            {tab === "done" && done.map(o => (
              <div key={o.id} className="co-card done">
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div>
                  <StatusBadge s="completed"/>
                </div>
                <div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:13 }}>{o.warungs?.name} → {o.dusun}</div>
                <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:15,color:"var(--p)",marginTop:6 }}>{fmt(o.dp_paid ? o.total - o.dp_amount : o.total)}</div>
              </div>
            ))}

            {tab === "done" && done.length > 0 && (
              <div className="card" style={{ background:"var(--gnl)" }}>
                <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:13,color:"var(--gn)",marginBottom:8 }}>💰 Rekap COD</div>
                {[["Total Terkumpul",fmt(cod),"var(--t)"],["Komisi Kurir 80%",fmt(Math.round(cod*.8)),"var(--gn)"],["Platform 20%",fmt(Math.round(cod*.2)),"var(--t2)"]].map(([l,v,c])=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4,color:"var(--t2)" }}><span>{l}</span><span style={{ fontWeight:800,color:c }}>{v}</span></div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// WARUNG OWNER PAGE
// ─────────────────────────────────────────────────────────────────────
function WarungOwnerPage({ user, showToast }) {
  const [warung,    setWarung]    = useState(null);
  const [myMenus,   setMyMenus]   = useState([]);
  const [myOrders,  setMyOrders]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState("orders");
  const [showAdd,   setShowAdd]   = useState(false);
  const [nN, setNN] = useState(""); const [nP, setNP] = useState(""); const [nD, setND] = useState(""); const [nE, setNE] = useState("🍽️");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: w } = await supabase.from("warungs").select("*").eq("owner_id", user.id).maybeSingle();
      if (w) {
        setWarung(w);
        const [menus, orders] = await Promise.all([api.getMenus(w.id), api.getOrdersForWarung(w.id)]);
        setMyMenus(menus || []);
        setMyOrders(orders || []);
      }
    } catch { showToast("❌ Gagal memuat data warung"); }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!warung?.id) return;
    const ch = supabase.channel("warung-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `warung_id=eq.${warung.id}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [warung?.id, load]);

  const addMenu = async () => {
    if (!nN || !nP || !warung) return;
    try {
      await api.addMenu(warung.id, { name: nN, description: nD, price: parseInt(nP), emoji: nE });
      setNN(""); setNP(""); setND(""); setNE("🍽️"); setShowAdd(false);
      showToast("✅ Menu baru ditambahkan!");
      load();
    } catch { showToast("❌ Gagal menambah menu"); }
  };

  const toggleOpen = async () => {
    if (!warung) return;
    await api.updateWarungOpen(warung.id, !warung.is_open);
    setWarung(w => ({ ...w, is_open: !w.is_open }));
    showToast(warung.is_open ? "🔴 Warung ditutup" : "🟢 Warung dibuka!");
  };

  if (loading) return <Spinner/>;

  if (!warung) return (
    <div>
      <div className="hdrw"><div className="htitle">Panel Warung</div></div>
      <div className="empty" style={{ paddingTop:60 }}>
        <div className="eico">🏪</div>
        <h3>Warung belum terdaftar</h3>
        <p>Hubungi admin untuk mendaftarkan warungmu ke KotarajaFood.</p>
        <div style={{ marginTop:20,fontSize:12,color:"var(--t3)" }}>📱 WA Admin: 0811-1234-5678</div>
      </div>
    </div>
  );

  const revenue = myOrders.filter(o=>o.status==="completed").reduce((s,o)=>s+o.food_total,0);

  return (
    <div>
      <div className="hdr">
        <div className="logo">{warung.emoji} Panel Warung</div>
        <div className="hloc">📍 {warung.dusun} · {warung.landmark}</div>
      </div>
      <div style={{ padding:16 }}>
        <div className="card" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <div>
            <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:14 }}>Status Warung</div>
            <div style={{ fontSize:12,color:"var(--t3)",marginTop:2 }}>Tampil ke pelanggan saat buka</div>
          </div>
          <div style={{ width:52,height:28,borderRadius:14,background:warung.is_open?"var(--gn)":"var(--bd2)",cursor:"pointer",position:"relative",transition:"background .3s",flexShrink:0 }} onClick={toggleOpen}>
            <div style={{ width:22,height:22,borderRadius:11,background:"#fff",position:"absolute",top:3,left:warung.is_open?26:3,transition:"left .25s",boxShadow:"0 1px 4px rgba(0,0,0,.2)" }}/>
          </div>
        </div>
        <div className="sgrid">
          <div className="st"><div className="sl">Pesanan Masuk</div><div className="sv r">{myOrders.filter(o=>o.status!=="completed").length}</div></div>
          <div className="st"><div className="sl">Pendapatan</div><div className="sv g s">{fmt(revenue)}</div></div>
        </div>
        <div className="tabs">
          <div className={`tab ${tab==="orders"?"on":""}`} onClick={()=>setTab("orders")}>Pesanan</div>
          <div className={`tab ${tab==="menu"?"on":""}`} onClick={()=>setTab("menu")}>Menu ({myMenus.length})</div>
          <div className={`tab ${tab==="info"?"on":""}`} onClick={()=>setTab("info")}>Info</div>
        </div>

        {tab === "orders" && (myOrders.length === 0 ? <div className="empty"><div className="eico">📭</div><h3>Belum ada pesanan</h3></div>
          : myOrders.map(o => (
            <div key={o.id} className="card">
              <div className="chd"><div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div><StatusBadge s={o.status}/></div>
              <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:14 }}>👤 {o.customer_name}</div>
              <div style={{ fontSize:12,color:"var(--t2)",marginTop:2 }}>
                {(o.order_items||[]).map(i=>`${i.menu_name} ×${i.qty}`).join(", ")}
              </div>
              <div style={{ fontSize:11,color:"var(--t3)",marginTop:3 }}>📍 {o.dusun} · {o.address}</div>
              <div style={{ fontSize:11,color:"var(--t3)" }}>📱 {o.customer_phone}</div>
              {o.dp_paid && <div style={{ fontSize:11,color:"var(--gn)",fontWeight:700,marginTop:3 }}>✅ DP {fmt(o.dp_amount)} verified</div>}
              <div style={{ display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:9,borderTop:"1px solid var(--bd)" }}>
                <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:15,color:"var(--p)" }}>{fmt(o.food_total)}</div>
                <div style={{ fontSize:10,color:"var(--t3)" }}>+Ongkir {fmt(o.ongkir)} (kurir)</div>
              </div>
            </div>
          ))
        )}

        {tab === "menu" && (
          <>
            <button className="btn bsec" style={{ marginBottom:12 }} onClick={() => setShowAdd(v => !v)}>{showAdd ? "✕ Batal" : "＋ Tambah Menu Baru"}</button>
            {showAdd && (
              <div className="card" style={{ marginBottom:12 }}>
                <div className="ctitle" style={{ marginBottom:10 }}>Menu Baru</div>
                <div className="fg"><label className="fl">Emoji</label><input className="fi" value={nE} onChange={e=>setNE(e.target.value)} style={{ maxWidth:80 }}/></div>
                <div className="fg"><label className="fl">Nama Menu</label><input className="fi" placeholder="Bakso Spesial…" value={nN} onChange={e=>setNN(e.target.value)}/></div>
                <div className="fg"><label className="fl">Deskripsi</label><input className="fi" placeholder="Singkat dan menarik…" value={nD} onChange={e=>setND(e.target.value)}/></div>
                <div className="fg"><label className="fl">Harga (Rp)</label><input className="fi" type="number" inputMode="numeric" placeholder="10000" value={nP} onChange={e=>setNP(e.target.value)}/></div>
                <button className="btn bpri" onClick={addMenu}>💾 Simpan Menu</button>
              </div>
            )}
            {myMenus.map(m => (
              <div key={m.id} className="mi">
                <div className="mimg">{m.emoji}</div>
                <div className="mdet"><div className="mn">{m.name}</div><div className="md">{m.category} · {m.description}</div><div className="mp">{fmt(m.price)}</div></div>
                <span className="bdg bg">Aktif</span>
              </div>
            ))}
          </>
        )}

        {tab === "info" && (
          <div>
            <div className="fg"><label className="fl">Nama Warung</label><input className="fi" defaultValue={warung.name} readOnly/></div>
            <div className="fg"><label className="fl">Dusun</label><input className="fi" defaultValue={warung.dusun} readOnly/></div>
            <div className="fg"><label className="fl">Landmark / Patokan</label><input className="fi" defaultValue={warung.landmark || ""} readOnly/></div>
            <div className="fg"><label className="fl">Jam Buka</label><input className="fi" defaultValue={warung.hours || ""} readOnly/></div>
            <div style={{ background:"linear-gradient(135deg,#EBF4FF,#DBEAFE)",borderRadius:12,height:100,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,fontSize:12,color:"var(--bl)",fontWeight:700,cursor:"pointer",border:"2px dashed #93C5FD" }} onClick={() => showToast("📍 GPS: " + (warung.lat||"-8.593") + ", " + (warung.lng||"116.421"))}>
              <span style={{ fontSize:22 }}>📍</span><span>Lihat Koordinat GPS</span>
              <span style={{ fontSize:10,color:"var(--t3)" }}>{warung.lat||"-8.593"}, {warung.lng||"116.421"}</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ADMIN PAGE
// ─────────────────────────────────────────────────────────────────────
function AdminPage({ showToast }) {
  const [orders,   setOrders]   = useState([]);
  const [warungs,  setWarungs]  = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("orders");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ord, war, cou] = await Promise.all([api.getPendingOrders(), api.getWarungs(), api.getCouriers()]);
      setOrders(ord || []);
      setWarungs(war || []);
      setCouriers(cou || []);
    } catch { showToast("❌ Gagal memuat data admin"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const revenue    = orders.filter(o=>o.status==="completed").reduce((s,o)=>s+o.total,0);
  const assignCourier = async (orderId, courierId) => {
    await supabase.from("orders").update({ courier_id: courierId, status: "accepted" }).eq("id", orderId);
    showToast("🛵 Kurir ditugaskan!");
    load();
  };

  return (
    <div>
      <div className="hdr">
        <div className="logo">Admin <em>Panel</em></div>
        <div className="hloc">🏢 KotarajaFood · <span className="rtdot"/> Live</div>
      </div>
      <div style={{ padding:16 }}>
        <div className="sgrid">
          <div className="st"><div className="sl">Warung</div><div className="sv">{warungs.length}</div></div>
          <div className="st"><div className="sl">Pesanan Aktif</div><div className="sv r">{orders.filter(o=>o.status!=="completed").length}</div></div>
          <div className="st"><div className="sl">Kurir Online</div><div className="sv g">{couriers.filter(c=>c.status==="online").length}</div></div>
          <div className="st"><div className="sl">Revenue 20%</div><div className="sv s g">{fmt(Math.round(revenue*.2))}</div></div>
        </div>

        <div className="tabs">
          <div className={`tab ${tab==="orders"?"on":""}`} onClick={()=>setTab("orders")}>Pesanan</div>
          <div className={`tab ${tab==="warungs"?"on":""}`} onClick={()=>setTab("warungs")}>Warung</div>
          <div className={`tab ${tab==="couriers"?"on":""}`} onClick={()=>setTab("couriers")}>Kurir</div>
        </div>

        {loading ? <Spinner/> : (
          <>
            {tab === "orders" && (orders.length === 0 ? <div className="empty"><div className="eico">📭</div><h3>Tidak ada pesanan aktif</h3></div>
              : orders.map(o => (
                <div key={o.id} className="card">
                  <div className="chd"><div style={{ fontFamily:"Nunito",fontWeight:700,fontSize:11,color:"var(--t3)" }}>#{o.id.slice(0,8).toUpperCase()}</div><StatusBadge s={o.status}/></div>
                  <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:14 }}>{o.warungs?.name || "?"}</div>
                  <div style={{ fontSize:12,color:"var(--t2)" }}>👤 {o.customer_name} · 📍 {o.dusun}</div>
                  <div style={{ fontSize:11,color:"var(--t3)",marginTop:2 }}>{(o.order_items||[]).map(i=>`${i.menu_name} ×${i.qty}`).join(", ")}</div>
                  {o.dp_paid && <div style={{ fontSize:11,color:"var(--gn)",fontWeight:700,marginTop:3 }}>🛡️ DP {fmt(o.dp_amount)} verified</div>}
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,paddingTop:9,borderTop:"1px solid var(--bd)" }}>
                    <div style={{ fontFamily:"Nunito",fontWeight:900,fontSize:15,color:"var(--p)" }}>{fmt(o.total)}</div>
                    {o.status === "pending" && !o.courier_id && (
                      <button className="btn bpri bsm" onClick={() => { const c = couriers.find(x=>x.status==="online"); if(c) assignCourier(o.id, c.id); else showToast("❌ Tidak ada kurir online"); }}>🛵 Tugaskan Kurir</button>
                    )}
                  </div>
                </div>
              ))
            )}

            {tab === "warungs" && warungs.map(w => (
              <div key={w.id} style={{ background:"#fff",borderRadius:12,padding:"11px 13px",marginBottom:9,boxShadow:"var(--sh)",display:"flex",alignItems:"center",gap:11 }}>
                <div style={{ width:44,height:44,borderRadius:11,background:"var(--pl)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>{w.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:13 }}>{w.name}</div>
                  <div style={{ fontSize:11,color:"var(--t3)" }}>{w.dusun} · {w.hours}</div>
                </div>
                <span className={`bdg ${w.is_open?"bg":"by"}`}>{w.is_open?"Buka":"Tutup"}</span>
              </div>
            ))}

            {tab === "couriers" && couriers.map(c => (
              <div key={c.id} className="card">
                <div className="chd">
                  <div>
                    <div style={{ fontFamily:"Nunito",fontWeight:800,fontSize:14 }}>🛵 {c.name}</div>
                    <div style={{ fontSize:11,color:"var(--t3)" }}>Zona {c.zone} · {c.phone}</div>
                  </div>
                  <span className={`bdg ${c.status==="online"?"bg":c.status==="busy"?"by":"bx"}`}>{c.status}</span>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  <div style={{ flex:1,background:"var(--pl)",borderRadius:9,padding:"8px 10px",textAlign:"center" }}>
                    <div style={{ fontSize:9,color:"var(--t3)",fontWeight:700,fontFamily:"Nunito" }}>COD</div>
                    <div style={{ fontFamily:"Nunito",fontWeight:900,color:"var(--p)",fontSize:14 }}>{fmt(c.cod_collected)}</div>
                  </div>
                  <button className="btn bsec bsm" style={{ flex:1 }} onClick={async ()=>{
                    const next = c.status==="online"?"offline":"online";
                    await api.setCourierStatus(c.id, next);
                    showToast(`${c.name} → ${next}`);
                    load();
                  }}>
                    {c.status==="online"?"Set Offline":"Set Online"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div style={{ height:16 }}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [user,      setUser]    = useState(null);
  const [screen,    setScreen]  = useState("home");
  const [navTab,    setNavTab]  = useState("home");
  const [warungs,   setWarungs] = useState([]);
  const [wLoading,  setWLoading]= useState(true);
  const [selWarung, setSelWarung]= useState(null);
  const [selMenus,  setSelMenus]= useState([]);
  const [menusLoad, setMenusLoad]= useState(false);
  const [cart,      setCart]    = useState({});
  const [cartOpen,  setCartOpen]= useState(false);
  const [lastOrder, setLastOrder]= useState(null);
  const [toast,     setToast]   = useState("");

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  // Load persisted user
  useEffect(() => {
    const stored = localStorage.getItem("kf_user");
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
  }, []);

  // Load warungs
  useEffect(() => {
    api.getWarungs().then(data => { setWarungs(data || []); setWLoading(false); }).catch(() => setWLoading(false));
    // Realtime warung open/close
    const ch = supabase.channel("warungs-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "warungs" }, () => api.getWarungs().then(setWarungs))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // Auto cancel expired DP orders every 60s
  useEffect(() => {
    const t = setInterval(() => api.cancelExpiredDPOrders().catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  const login = user => {
    setUser(user);
    localStorage.setItem("kf_user", JSON.stringify(user));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("kf_user");
    setScreen("home");
    setNavTab("home");
    setCart({});
    setSelWarung(null);
  };

  const openWarung = async w => {
    setSelWarung(w);
    setCart({});
    setMenusLoad(true);
    setScreen("warung");
    try {
      const menus = await api.getMenus(w.id);
      setSelMenus(menus || []);
    } catch { showToast("❌ Gagal memuat menu"); }
    setMenusLoad(false);
  };

  const handleQty = (id, n) => {
    setCart(prev => { const nx = { ...prev }; if (n <= 0) delete nx[id]; else nx[id] = Math.min(n, MAX_QTY_ITEM); return nx; });
  };

  const cartCount = Object.values(cart).reduce((s, v) => s + v, 0);

  const navFor = role => {
    if (role === "courier") return [{ id:"home",ico:"🛵",lbl:"Dashboard" }];
    if (role === "warung")  return [{ id:"home",ico:"🏪",lbl:"Warung" }];
    if (role === "admin")   return [{ id:"home",ico:"🏢",lbl:"Admin" }];
    return [{ id:"home",ico:"🏠",lbl:"Beranda" },{ id:"orders",ico:"📋",lbl:"Pesanan" },{ id:"profile",ico:"🛡️",lbl:"Profil" }];
  };

  if (!user) return (
    <>
      <style>{CSS}</style>
      <div className="app"><div className="scr"><AuthPage onLogin={login}/></div></div>
    </>
  );

  const renderScreen = () => {
    const role = user.role;
    if (role === "courier") return <CourierPage user={user} showToast={showToast}/>;
    if (role === "warung")  return <WarungOwnerPage user={user} showToast={showToast}/>;
    if (role === "admin")   return <AdminPage showToast={showToast}/>;

    switch (screen) {
      case "success":
        return <SuccessPage order={lastOrder} onHome={() => { setScreen("home"); setNavTab("home"); }}/>;
      case "checkout":
        return selWarung ? (
          <CheckoutPage warung={selWarung} menus={selMenus} cart={cart} user={user} showToast={showToast}
            onBack={() => setScreen("warung")}
            onSuccess={order => { setLastOrder(order); setCart({}); setCartOpen(false); setScreen("success"); }}
          />
        ) : null;
      case "warung":
        return selWarung ? (
          <WarungPage warung={selWarung} menus={selMenus} menusLoading={menusLoad} cart={cart} user={user}
            onQty={handleQty} onBack={() => { setScreen("home"); setNavTab("home"); }}
            onCartOpen={() => setCartOpen(true)}
          />
        ) : null;
      case "orders":
        return <OrdersPage user={user} showToast={showToast}/>;
      case "profile":
        return <ProfilePage user={user} onLogout={logout}/>;
      default:
        return <HomePage user={user} warungs={warungs} loading={wLoading} cartCount={cartCount} onWarung={openWarung} onCartOpen={() => setCartOpen(true)}/>;
    }
  };

  const showNav = !["checkout","success"].includes(screen);

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <Toast msg={toast}/>
        <div className="scr">{renderScreen()}</div>

        {/* Cart drawer — customers on warung screen */}
        {user.role === "customer" && screen === "warung" && (
          <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart}
            menus={selMenus} warung={selWarung} onQty={handleQty}
            onCheckout={() => { setCartOpen(false); setScreen("checkout"); }}
          />
        )}

        {showNav && (
          <div className="bnav">
            {navFor(user.role).map(n => {
              const isOn = navTab === n.id;
              return (
                <div key={n.id} className={`ni ${isOn?"on":""}`}
                  onClick={() => {
                    setNavTab(n.id);
                    if (n.id === "home") setScreen("home");
                    else if (n.id === "orders") setScreen("orders");
                    else if (n.id === "profile") setScreen("profile");
                  }}>
                  <div className="nic">{n.ico}</div>
                  <div className="nlb">{n.lbl}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
