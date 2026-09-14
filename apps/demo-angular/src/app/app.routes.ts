import type { Routes } from "@angular/router";

export const routes: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("./features/search/search-page.component.js").then((m) => m.SearchPageComponent),
  },
  {
    path: "checkout",
    loadComponent: () =>
      import("./features/checkout/checkout-page.component.js").then((m) => m.CheckoutPageComponent),
  },
  {
    path: "orders",
    loadComponent: () =>
      import("./features/orders/orders-page.component.js").then((m) => m.OrdersPageComponent),
  },
  { path: "**", redirectTo: "" },
];
