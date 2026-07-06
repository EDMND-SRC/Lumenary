import { gsap } from 'gsap';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { initFirebase } from '../config/firebase';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'google' | 'anonymous';
}

function firebaseUserToAuthUser(user: User): AuthUser {
  const isGoogle = user.providerData.some(
    (p) => p.providerId === GoogleAuthProvider.PROVIDER_ID
  );
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    provider: isGoogle ? 'google' : 'anonymous',
  };
}

export class AuthScreen {
  private container: HTMLDivElement;
  private onAuth: (user: AuthUser) => void;
  private googleBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private auth: ReturnType<typeof getAuth>;
  private isSigningIn = false;

  constructor(container: HTMLDivElement, onAuth: (user: AuthUser) => void) {
    this.container = container;
    this.onAuth = onAuth;
    this.googleBtn = document.getElementById('google-signin-btn') as HTMLButtonElement;
    this.skipBtn = document.getElementById('skip-auth-btn') as HTMLButtonElement;

    const { auth } = initFirebase();
    this.auth = auth;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isSigningIn) return;
      this.handleAnonymousSignIn();
    });

    this.googleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.isSigningIn) return;
      this.handleGoogleSignIn();
    });
  }

  private async handleGoogleSignIn(): Promise<void> {
    this.isSigningIn = true;
    this.setButtonLoading(this.googleBtn, true);

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      const result = await signInWithPopup(this.auth, provider);
      const user = firebaseUserToAuthUser(result.user);
      this.onAuth(user);
    } catch (err: unknown) {
      console.error('[Auth] Google sign-in failed:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/popup-closed-by-user') {
        this.showError('Sign-in cancelled.');
      } else if (code === 'auth/configuration-not-found') {
        this.showError('Google sign-in not configured yet. Continuing as guest.');
        setTimeout(() => this.handleAnonymousSignIn(), 1200);
      } else {
        this.showError('Google sign-in failed. Continuing as guest.');
        setTimeout(() => this.handleAnonymousSignIn(), 1200);
      }
    } finally {
      this.isSigningIn = false;
      this.setButtonLoading(this.googleBtn, false);
    }
  }

  private async handleAnonymousSignIn(): Promise<void> {
    this.isSigningIn = true;
    this.setButtonLoading(this.skipBtn, true);

    try {
      const result = await signInAnonymously(this.auth);
      const user = firebaseUserToAuthUser(result.user);
      this.onAuth(user);
    } catch (err: unknown) {
      console.error('[Auth] Anonymous sign-in failed:', err);
      const code = (err as { code?: string }).code;
      if (code === 'auth/configuration-not-found') {
        this.onAuth({
          uid: 'local-guest',
          email: null,
          displayName: 'Guest',
          photoURL: null,
          provider: 'anonymous',
        });
      } else {
        this.showError('Sign-in failed. Please try again.');
      }
    } finally {
      this.isSigningIn = false;
      this.setButtonLoading(this.skipBtn, false);
    }
  }

  private setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
    if (loading) {
      btn.style.opacity = '0.6';
      btn.style.pointerEvents = 'none';
    } else {
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
    }
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.classList.add('visible');
    gsap.fromTo(
      '#auth-card',
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, delay: 0.15, ease: 'power2.out' }
    );
  }

  hide(): void {
    gsap.to(this.container, {
      opacity: 0,
      duration: 0.3,
      onComplete: () => {
        this.container.classList.remove('visible');
        this.container.classList.add('hidden');
      },
    });
  }

  showError(message: string): void {
    const errorEl = document.getElementById('auth-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      gsap.fromTo(errorEl, { opacity: 0 }, { opacity: 1, duration: 0.3 });
    }
  }
}
