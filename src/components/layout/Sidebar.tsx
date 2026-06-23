"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  ClipboardList,
  Home,
  ScanBarcode,
  Settings,
  ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { startNavigationLoading } from "@/components/shared/NavigationLoadingOverlay";

const navItems = [
  { href: routes.dashboard, label: "Accueil", icon: Home },
  { href: routes.inventory, label: "Inventaire", icon: Box },
  { href: routes.shopping, label: "Courses", icon: ShoppingCart },
  { href: routes.settings, label: "Paramètres", icon: Settings }
];

const mobileRouteHrefs = new Set<string>([
  routes.dashboard,
  routes.inventory,
  routes.shopping,
  routes.settings
]);

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-700 text-white lg:flex">
        <div className="flex h-20 items-center gap-3 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-900/35">
            <Box className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-bold">EcoFoodStock</p>
            <p className="text-xs text-white">Foyer partagé</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-4 py-6">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-white">
            Navigation
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!active) {
                    startNavigationLoading();
                  }
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition",
                  active && "bg-white text-brand-700 shadow-sm",
                  !active && "text-white",
                  !active && "hover:bg-white/10"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 p-4">
          <Link
            href={`${routes.inventory}?add=scan`}
            onClick={(event) => {
              if (pathname === routes.inventory) {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("ecofoodstock:open-add-product", { detail: { mode: "scan" } }));
              } else {
                startNavigationLoading();
              }
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 py-4 text-sm font-semibold text-white hover:bg-brand-900/90"
          >
            <ScanBarcode className="h-5 w-5" />
            Scanner un produit
          </Link>
          <Link
            href={`${routes.inventory}?add=manual`}
            onClick={(event) => {
              if (pathname === routes.inventory) {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent("ecofoodstock:open-add-product", { detail: { mode: "manual" } }));
              } else {
                startNavigationLoading();
              }
            }}
            className="flex items-center justify-center gap-2 text-xs text-white hover:text-brand-50"
          >
            <ClipboardList className="h-4 w-4" />
            Ajouter manuellement
          </Link>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white px-2 py-2 shadow-soft lg:hidden">
        {navItems
          .filter((item) => mobileRouteHrefs.has(item.href))
          .map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (!active) {
                    startNavigationLoading();
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] text-slate-500",
                  active && "bg-brand-50 text-brand-700"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </nav>
    </>
  );
}
