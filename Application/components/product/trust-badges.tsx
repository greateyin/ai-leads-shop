/**
 * 信任標章元件
 * 顯示運送、退換貨、安全支付等信任資訊
 * 提升消費者購買信心，降低決策障礙
 */
export function TrustBadges() {
  const badges = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      title: "免費退換貨",
      description: "7 天鑑賞期內可退換",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: "安全支付",
      description: "SSL 加密保護交易",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      title: "快速出貨",
      description: "下單後 1-3 個工作天",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      title: "客服支援",
      description: "週一至週五線上客服",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {badges.map((badge) => (
        <div
          key={badge.title}
          className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30"
        >
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            {badge.icon}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground leading-tight">
              {badge.title}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {badge.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
