export class LoadingScreen {
  private container: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private progressFill: HTMLDivElement;
  private statusText: HTMLDivElement;
  private percentText: HTMLDivElement;

  constructor() {
    this.container = document.getElementById('loading-screen') as HTMLDivElement;
    this.progressBar = document.getElementById('progress-bar') as HTMLDivElement;
    this.progressFill = document.getElementById('progress-fill') as HTMLDivElement;
    this.statusText = document.getElementById('loading-status') as HTMLDivElement;
    this.percentText = document.getElementById('loading-percent') as HTMLDivElement;
  }

  show(): void {
    this.container.classList.remove('hidden');
    this.container.classList.add('visible');
  }

  hide(): void {
    this.container.classList.remove('visible');
    this.container.classList.add('hidden');
  }

  updateProgress(progress: number, status: string): void {
    const pct = Math.min(100, Math.max(0, progress * 100));
    this.progressFill.style.width = `${pct}%`;
    this.percentText.textContent = `${pct.toFixed(1)}%`;
    this.statusText.textContent = status;
  }

  setComplete(message: string): void {
    this.progressFill.style.width = '100%';
    this.percentText.textContent = '100%';
    this.statusText.textContent = message;
  }
}
