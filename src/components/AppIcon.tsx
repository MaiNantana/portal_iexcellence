import {
  Banknote,
  CalendarDays,
  ChartColumn,
  Clock,
  FileText,
  Folder,
  LayoutGrid,
  Link2,
  ReceiptText,
  ShoppingCart,
  SquareCheckBig,
  Star,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Systems and links by kind, plus the keys in SERVICE_ICONS. */
const ICONS: Record<string, LucideIcon> = {
  hr: Clock,
  task: SquareCheckBig,
  personal: Star,
  company: Link2,
  apps: LayoutGrid,
  wrench: Wrench,
  folder: Folder,
  document: FileText,
  quote: ReceiptText,
  money: Banknote,
  cart: ShoppingCart,
  truck: Truck,
  people: Users,
  calendar: CalendarDays,
  chart: ChartColumn,
};

export function AppIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Glyph = ICONS[name] ?? LayoutGrid;
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" />;
}
