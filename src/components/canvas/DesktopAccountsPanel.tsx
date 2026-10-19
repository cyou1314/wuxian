"use client";
import { useEffect, useState } from 'react';
import { getDesktopDolaPool } from '@/lib/dola-pool';
import type { DolaAccount } from '@/types/libtv-schema';

export default function DesktopAccountsPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<DolaAccount[]>([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => setAccounts((await getDesktopDolaPool()).listAccounts());
  useEffect(() => { void refresh().catch((e) => setError(String(e))); }, []);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div className="absolute right-4 top-20 z-30 w-[360px] rounded-xl border border-[var(--wx-border)] bg-[var(--wx-bg-panel)] p-4 shadow-2xl">
    <div className="mb-3 flex justify-between"><h3>Dola 账号</h3><button onClick={onClose}>×</button></div>
    <p className="mb-3 text-xs leading-relaxed text-[var(--wx-text-2)]">每个账号使用独立登录窗口。请在窗口中完成登录，再回到画布执行任务。登录状态由本机浏览器会话保存；登录面板可能在子窗口打开。添加账号只建立独立会话，不代表已经登录成功。</p>
    <div className="max-h-72 space-y-2 overflow-auto">{accounts.map((a) => <div key={a.id} className="rounded bg-[var(--wx-text-1)]/5 p-2 text-xs">
      <div>{a.label}</div><div className="my-1 text-[var(--wx-text-2)]">剩余额度：{a.quotaRemaining ?? '未知'} · 今日已用：{a.quotaDailyUsed}</div>
      <div className="flex gap-3"><button disabled={busy} onClick={() => void act(() => window.wuxianDesktop!.login(a.id))}>打开登录窗口</button>
      <button disabled={busy} className="text-[var(--wx-danger)]" onClick={() => { if (window.confirm('移除此账号并清除本机登录状态？')) void act(() => window.wuxianDesktop!.removeAccount(a.id)); }}>移除</button></div>
    </div>)}</div>
    <input className="my-3 w-full rounded bg-[var(--wx-text-1)]/5 p-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="账号备注（可选）" />
    <button disabled={busy} className="wx-primary w-full rounded bg-[var(--wx-accent)] p-2 text-sm disabled:opacity-50" onClick={() => void act(() => window.wuxianDesktop!.login(undefined, label))}>添加账号并登录</button>
    <button disabled={busy} className="mt-2 text-xs text-[var(--wx-text-2)]" onClick={() => void act(refresh)}>刷新本机账号信息</button>
    {error && <p className="mt-2 text-xs text-[var(--wx-danger)]">{error}</p>}
  </div>;
}
