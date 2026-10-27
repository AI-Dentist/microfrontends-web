import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Standalone host on port 4201. ERP_ROUTES renders the shared sidebar/top badges once;
 * federation mounts that same layout without bootstrapping this outer outlet. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
