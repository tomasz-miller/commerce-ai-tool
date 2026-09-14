import type { ApplicationConfig } from "@angular/core";
import { provideRouter } from "@angular/router";
import { routes } from "./app.routes.js";
import { DEMO_CONFIG, defaultDemoConfig } from "./core/config/demo-config.js";

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: DEMO_CONFIG, useValue: defaultDemoConfig() },
  ],
};
