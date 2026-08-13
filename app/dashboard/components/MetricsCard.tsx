import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  DollarSign,
  FileText,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  Wallet,
  Activity,
  ShoppingCart,
  Receipt,
  AlertCircle,
  CheckSquare,
  XSquare,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Minus,
  Building2,
  Bell,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ============================================
// ICON REGISTRY - PascalCase keys
// ============================================
const icons = {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Banknote,
  Package,
  FileText,
  CreditCard,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  Wallet,
  Activity,
  ShoppingCart,
  Receipt,
  AlertCircle,
  CheckSquare,
  XSquare,
  Building2,
  Bell,
  ArrowUpCircle,
  ArrowDownCircle,
  Scale,
};

export type IconName = keyof typeof icons;

// ============================================
// METRIC CARD COMPONENT
// ============================================
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: IconName;
  iconColor?: string;
  trend?: number;
  trendLabel?: string;
  alert?: boolean;
  href?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = "text-yellow-500",
  trend,
  trendLabel,
  alert = false,
  href,
}: MetricCardProps) {
  const Icon = icons[icon];

  // Colored icon "chip" — the main thing that gives KPI cards their colour
  // (matches the ERP dashboard's Stat tiles). We derive a soft tinted
  // background + a stronger icon tone from the `iconColor` each dashboard
  // already passes, so no call site has to change. Every class here is a
  // literal string so Tailwind statically generates it.
  const TONES: Record<string, { bg: string; fg: string }> = {
    blue: { bg: "bg-blue-500/10", fg: "text-blue-600 dark:text-blue-400" },
    emerald: { bg: "bg-emerald-500/10", fg: "text-emerald-600 dark:text-emerald-400" },
    green: { bg: "bg-green-500/10", fg: "text-green-600 dark:text-green-400" },
    violet: { bg: "bg-violet-500/10", fg: "text-violet-600 dark:text-violet-400" },
    purple: { bg: "bg-purple-500/10", fg: "text-purple-600 dark:text-purple-400" },
    red: { bg: "bg-red-500/10", fg: "text-red-600 dark:text-red-400" },
    rose: { bg: "bg-rose-500/10", fg: "text-rose-600 dark:text-rose-400" },
    orange: { bg: "bg-orange-500/10", fg: "text-orange-600 dark:text-orange-400" },
    amber: { bg: "bg-amber-500/10", fg: "text-amber-600 dark:text-amber-400" },
    yellow: { bg: "bg-yellow-500/15", fg: "text-yellow-600 dark:text-yellow-400" },
    cyan: { bg: "bg-cyan-500/10", fg: "text-cyan-600 dark:text-cyan-400" },
    indigo: { bg: "bg-indigo-500/10", fg: "text-indigo-600 dark:text-indigo-400" },
    pink: { bg: "bg-pink-500/10", fg: "text-pink-600 dark:text-pink-400" },
    teal: { bg: "bg-teal-500/10", fg: "text-teal-600 dark:text-teal-400" },
    sky: { bg: "bg-sky-500/10", fg: "text-sky-600 dark:text-sky-400" },
    primary: { bg: "bg-primary/10", fg: "text-primary" },
  };
  const toneKey =
    Object.keys(TONES).find((k) => iconColor.includes(k)) || "yellow";
  const chip = TONES[toneKey];

  // Trend indicator
  const TrendIcon =
    trend === undefined
      ? null
      : trend > 0
      ? ArrowUpRight
      : trend < 0
      ? ArrowDownRight
      : Minus;

  const trendColor =
    trend === undefined
      ? ""
      : trend > 0
      ? "text-green-500"
      : trend < 0
      ? "text-red-500"
      : "text-muted-foreground";

  const content = (
    <Card
      className={cn(
        "relative h-full",
        "bg-card border border-border/40",
        "hover:border-border hover:shadow-sm",
        "transition-all duration-200",
        href && "cursor-pointer"
      )}
    >
      <div className="p-3 sm:p-4">
        {/* Header: Label + Icon */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-medium text-muted-foreground leading-none">
            {title}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {alert && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            )}
            <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-lg", chip.bg)}>
              <Icon className={cn("w-4 h-4", chip.fg)} />
            </span>
          </div>
        </div>

        {/* Value */}
        <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums tracking-tight leading-none">
          {value}
        </p>

        {/* Footer: Subtitle + Trend */}
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
          {trend !== undefined && TrendIcon && (
            <div className={cn("flex items-center gap-0.5 text-xs font-medium shrink-0", trendColor)}>
              <TrendIcon className="w-3 h-3" />
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

// ============================================
// METRIC CARD SKELETON
// ============================================
export function MetricCardSkeleton() {
  return (
    <Card className="h-full bg-card border border-border/40">
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="h-3 w-20 bg-muted animate-pulse rounded" />
          <div className="h-3.5 w-3.5 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-7 w-20 bg-muted animate-pulse rounded mb-1.5" />
        <div className="h-3 w-14 bg-muted animate-pulse rounded" />
      </div>
    </Card>
  );
}

// ============================================
// METRIC CARDS GRID - Consistent sizing
// ============================================
interface MetricCardsGridProps {
  children: React.ReactNode;
  cols?: 2 | 3 | 4 | 5 | 6;
}

export function MetricCardsGrid({ children, cols = 4 }: MetricCardsGridProps) {
  // Responsive grid with consistent card sizing
  const gridClass = cn(
    "grid gap-3 sm:gap-4",
    // Always 2 cols on mobile for consistency
    "grid-cols-2",
    // Tablet and up
    cols === 2 && "sm:grid-cols-2",
    cols === 3 && "sm:grid-cols-3",
    cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
    cols === 5 && "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
    cols === 6 && "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6"
  );

  return <div className={gridClass}>{children}</div>;
}

export function MetricCardsGridSkeleton({ count = 4 }: { count?: number }) {
  const cols = count <= 4 ? 4 : count <= 5 ? 5 : 6;

  return (
    <MetricCardsGrid cols={cols as 2 | 3 | 4 | 5 | 6}>
      {Array.from({ length: count }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </MetricCardsGrid>
  );
}
