import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_SESSION } from './platform';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = inject(AUTH_SESSION);
  private readonly router = inject(Router);
  readonly state = signal(this.session.snapshot());
  readonly authenticated = computed(() => this.state().status === 'authenticated');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  constructor() {
    const unsubscribe = this.session.subscribe(next => this.state.set(next));
    inject(DestroyRef).onDestroy(unsubscribe);
  }
  async login() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try { await this.session.login('/'); }
    catch { this.error.set('Sign in unavailable. Please try again.'); }
    finally { this.busy.set(false); }
  }
  async callback(href: string) {
    this.busy.set(true); this.error.set(null);
    try { await this.router.navigateByUrl(await this.session.callback(href), { replaceUrl: true }); }
    catch {
      this.error.set('Sign in failed. Please sign in again.');
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    } finally { this.busy.set(false); }
  }
  async logout() {
    this.error.set(null);
    try { await this.session.logout(); }
    catch { this.error.set('Signed out locally. Identity provider logout unavailable.'); }
    await this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
