"use client";

/**
 * AccountsPanel — Dola 多账号管理（wuxian 差异化核心的入口）
 *
 * 口令解锁（PBKDF2 → AES-GCM 保险库）→ 粘贴 Cookie 添加账号 →
 * 查看每账号剩余额度/日消耗/状态。Cookie 明文只在内存停留。
 */
import { useEffect, useState } from "react";
import { getDolaPool, getDolaPoolSync, lockDolaPool } from "@/lib/dola-pool";
import type { DolaAccount } from "@/types/libtv-schema";

export default function AccountsPanel({ onClose }: { onClose: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [cookie, setCookie] = useState("");
  const [label, setLabel] = useState("");
  const [accounts, setAccounts] = useState<DolaAccount[]>([]);
  const [error, setError] = useState("");

  const refresh = () => {
    const pool = getDolaPoolSync();
    setAccounts(pool ? pool.listAccounts() : []);
  };

  useEffect(() => {
    if (getDolaPoolSync()) {
      setUnlocked(true);
      refresh();
    }
  }, []);

  const unlock = async () => {
    if (!passphrase) {
      setError("请输入解锁口令");
      return;
    }
    try {
      await getDolaPool(passphrase);
      setUnlocked(true);
      setError("");
      refresh();
    } catch {
      setError("解锁失败");
    }
  };

  const add = async () => {
    const pool = getDolaPoolSync();
    if (!pool) return;
    if (!cookie.trim()) {
      setError("请粘贴 Dola session cookie");
      return;
    }
    await pool.addAccount(label.trim() || `账号${accounts.length + 1}`, cookie.trim());
    setCookie("");
    setLabel("");
    setError("");
    refresh();
  };

  const lock = () => {
    lockDolaPool();
    setUnlocked(false);
    setAccounts([]);
    setPassphrase("");
  };

  const remove = (id: string) => {
    getDolaPoolSync()?.removeAccount(id);
    refresh();
  };

  return (
    <div className="absolute top-20 right-4 z-30 w-[340px] rounded-xl border border-[var(--wx-border)] bg-[var(--wx-bg-panel)] p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Dola 多账号 · 额度控制</h3>
        <button onClick={onClose} className="rounded px-2 text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10">
          ×
        </button>
      </div>

      {!unlocked ? (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--wx-text-2)]">
            口令用于派生 AES-GCM 密钥加密 Cookie，仅存内存，不落盘。
          </p>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="解锁口令"
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            className="w-full rounded bg-[var(--wx-text-1)]/5 px-2 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--wx-accent)]"
          />
          <button
            onClick={unlock}
            className="wx-primary w-full rounded bg-[var(--wx-accent)]/80 py-2 text-sm font-medium text-[var(--wx-text-1)] hover:bg-[var(--wx-accent)]"
          >
            解锁账号池
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {accounts.length === 0 && (
              <p className="text-[11px] text-[var(--wx-text-2)]">暂无账号，请添加 Cookie 登录。</p>
            )}
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded bg-[var(--wx-text-1)]/[0.04] px-2 py-1.5"
              >
                <div>
                  <div className="text-[12px] text-[var(--wx-text-1)]">{a.label}</div>
                  <div className="text-[11px] text-[var(--wx-text-2)]">
                    剩余额度：{a.quotaRemaining ?? "未知"} · 今日已用：{a.quotaDailyUsed} ·
                    <span
                      className={
                        a.status === "active"
                          ? "text-[var(--wx-success)]"
                          : a.status === "exhausted"
                            ? "text-[var(--wx-warning)]"
                            : "text-[var(--wx-danger)]"
                      }
                    >
                      {a.status === "active" ? "可用" : a.status === "exhausted" ? "额度耗尽" : "失效"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => remove(a.id)}
                  className="rounded px-1 text-[var(--wx-text-2)] hover:bg-[var(--wx-danger)]/20 hover:text-[var(--wx-danger)]"
                  title="移除账号"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-[var(--wx-border)] pt-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="账号备注（可选）"
              className="w-full rounded bg-[var(--wx-text-1)]/5 px-2 py-1.5 text-[12px] outline-none focus:ring-1 focus:ring-[var(--wx-accent)]"
            />
            <textarea
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              placeholder="粘贴 Dola session cookie（添加后即加密）"
              rows={3}
              className="w-full rounded bg-[var(--wx-text-1)]/5 px-2 py-1.5 font-mono text-[11px] outline-none focus:ring-1 focus:ring-[var(--wx-accent)]"
            />
            <button
              onClick={add}
              className="wx-primary w-full rounded bg-[var(--wx-accent)]/80 py-1.5 text-sm font-medium text-[var(--wx-text-1)] hover:bg-[var(--wx-accent)]"
            >
              添加账号（Cookie 登录）
            </button>
            <button
              onClick={lock}
              className="w-full rounded bg-[var(--wx-text-1)]/5 py-1.5 text-[12px] text-[var(--wx-text-2)] hover:bg-[var(--wx-text-1)]/10"
            >
              锁定（清除内存密钥）
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-[var(--wx-danger)]">{error}</p>}
    </div>
  );
}
