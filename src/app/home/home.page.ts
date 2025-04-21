import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonList,
  IonLabel,
  IonFab,
  IonFabButton,
  IonIcon,
  IonButton,
  IonCheckbox,
  IonFooter,
  ActionSheetController,
  AlertController,
  LoadingController,
  ToastController
} from '@ionic/angular/standalone';
import { Storage } from '@ionic/storage-angular';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { addIcons } from 'ionicons';
import { add, trashOutline, documentTextOutline, checkmarkCircleOutline, closeCircleOutline, optionsOutline, sparklesOutline, copyOutline, saveOutline, layersOutline } from 'ionicons/icons';
import { GeminiService, SynthesisMode } from '../services/gemini.service';
import { finalize } from 'rxjs/operators';

interface Note {
  id: number;
  title: string;
  content: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonList,
    IonLabel,
    IonFab,
    IonFabButton,
    IonIcon,
    IonButton,
    IonCheckbox,
    IonFooter,
    CommonModule,
  ],
})
export class HomePage implements OnInit {
  notes: Note[] = [];
  isSynthesisMode: boolean = false;
  selectedNoteIds = new Set<number>();
  private _storage: Storage | null = null;

  constructor(
    private storage: Storage,
    private router: Router,
    private actionSheetController: ActionSheetController,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private geminiService: GeminiService,
    private cdr: ChangeDetectorRef
  ) {
    this.initStorage();
    addIcons({ add, trashOutline, documentTextOutline, checkmarkCircleOutline, closeCircleOutline, optionsOutline, sparklesOutline, copyOutline, saveOutline, layersOutline });
  }

  async initStorage() {
    const storage = await this.storage.create();
    this._storage = storage;
    this.loadNotes();
  }

  ngOnInit() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd && event.url === '/home') {
        this.loadNotes();
      }
    });
  }

  async loadNotes() {
    if (!this._storage) return;
    const storedNotes = await this._storage.get('notes');
    this.notes = (storedNotes || []).sort((a: Note, b: Note) => b.id - a.id);
  }

  async confirmDeleteNote(event: Event, id: number) {
    event.stopPropagation();
    const alert = await this.alertController.create({
      header: 'Potwierdź usunięcie',
      message: 'Czy na pewno chcesz usunąć tę notatkę?',
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel',
          cssClass: 'secondary'
        }, {
          text: 'Usuń',
          cssClass: 'danger',
          handler: () => {
            this.deleteNoteById(id);
          }
        }
      ]
    });

    await alert.present();
  }

  private async deleteNoteById(id: number) {
    if (!this._storage) return;
    
    try {
        const currentNotes: Note[] = [...this.notes];
        const updatedNotes = currentNotes.filter(note => note.id !== id);
        await this._storage.set('notes', updatedNotes);
        this.notes = updatedNotes;
        this.selectedNoteIds.delete(id);
        this.cdr.detectChanges();
        this.presentToast('Notatka usunięta.', 'medium');
    } catch (error) {
        console.error("Error deleting note:", error);
        this.presentToast('Wystąpił błąd podczas usuwania notatki.', 'danger');
    }
  }

  createNewNote() {
    if (this.isSynthesisMode) return;
    this.router.navigate(['/note/new']);
  }

  goToNote(id: number) {
    if (this.isSynthesisMode) {
      this.toggleNoteSelection(id);
      return;
    }
    this.router.navigate(['/note', id]);
  }

  toggleSynthesisMode() {
    this.isSynthesisMode = !this.isSynthesisMode;
    if (!this.isSynthesisMode) {
      this.selectedNoteIds.clear();
    }
  }

  toggleNoteSelection(id: number) {
    if (this.selectedNoteIds.has(id)) {
      this.selectedNoteIds.delete(id);
    } else {
      this.selectedNoteIds.add(id);
    }
  }

  get canSynthesize(): boolean {
    return this.selectedNoteIds.size >= 2;
  }

  async presentSynthesisOptions() {
    if (!this.canSynthesize) return;

    const actionSheet = await this.actionSheetController.create({
      header: 'Tryb syntezy Gemini',
      buttons: [
        {
          text: 'Utwórz spójny tekst',
          icon: 'document-text-outline',
          handler: () => {
            this.startSynthesis('coherent_text');
          }
        },
        {
          text: 'Stwórz notatkę syntetyzującą',
          icon: 'sparkles-outline',
          handler: () => {
            this.startSynthesis('summary');
          }
        },
        {
          text: 'Instrukcja niestandardowa',
          icon: 'options-outline',
          handler: () => {
            this.presentCustomSynthesisPrompt();
          }
        },
        {
          text: 'Anuluj',
          icon: 'close-circle-outline',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async presentCustomSynthesisPrompt() {
    const alert = await this.alertController.create({
      header: 'Niestandardowa Synteza',
      message: 'Wpisz polecenie, jak Gemini ma połączyć wybrane notatki.',
      inputs: [
        {
          name: 'prompt',
          type: 'textarea',
          placeholder: 'Np. Połącz kluczowe punkty w listę zadań, Stwórz krótkie podsumowanie dla każdej notatki'
        }
      ],
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel',
        },
        {
          text: 'Syntetyzuj',
          handler: (data) => {
            if (data.prompt && data.prompt.trim()) {
              this.startSynthesis('custom', data.prompt.trim());
            } else {
              this.presentToast('Polecenie nie może być puste.', 'warning');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async startSynthesis(mode: SynthesisMode, customPrompt?: string) {
    if (!this._storage) return;

    const selectedNotes = this.notes.filter(note => this.selectedNoteIds.has(note.id));
    if (selectedNotes.length < 2) {
      this.presentToast('Wybierz co najmniej 2 notatki.', 'warning');
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Gemini syntetyzuje notatki...',
    });
    await loading.present();

    this.geminiService.synthesizeNotes(selectedNotes, mode, customPrompt)
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.toggleSynthesisMode();
        })
      )
      .subscribe({
        next: (synthesizedContent: string) => {
          this.presentSynthesisResult(synthesizedContent);
        },
        error: (err: Error | any) => {
          console.error('Error during Gemini synthesis:', err);
          let errorMessage = 'Wystąpił błąd podczas syntezy przez Gemini.';
          if (err instanceof Error) {
            errorMessage = err.message;
          }
          this.presentToast(errorMessage, 'danger');
        }
      });
  }

  async presentSynthesisResult(content: string) {
    const alert = await this.alertController.create({
      header: 'Wynik Syntezy',
      message: content,
      cssClass: 'synthesis-alert-message',
      backdropDismiss: false,
      buttons: [
        {
          text: 'Kopiuj',
          cssClass: 'alert-button-copy',
          handler: async () => {
            try {
              await navigator.clipboard.writeText(content);
              this.presentToast('Skopiowano do schowka.');
            } catch (err) {
              console.error('Failed to copy text: ', err);
              this.presentToast('Błąd kopiowania.', 'danger');
            }
            return false;
          }
        },
        {
          text: 'Zapisz',
          cssClass: 'alert-button-save',
          handler: () => {
            this.presentSaveSynthesisPrompt(content);
          }
        },
        {
          text: 'Zamknij',
          role: 'cancel'
        }
      ]
    });
    await alert.present();
  }

  async presentSaveSynthesisPrompt(content: string) {
    const defaultTitle = `Synteza (${new Date().toLocaleDateString()})`;
    const alert = await this.alertController.create({
      header: 'Zapisz Syntezę',
      message: 'Podaj tytuł dla nowej notatki:',
      inputs: [
        {
          name: 'title',
          type: 'text',
          placeholder: 'Tytuł notatki',
          value: defaultTitle
        }
      ],
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel'
        },
        {
          text: 'Zapisz',
          handler: (data) => {
            const title = data.title?.trim() || defaultTitle;
            this._saveNoteToStorage(title, content);
          }
        }
      ]
    });
    await alert.present();
  }

  private async _saveNoteToStorage(title: string, content: string) {
    if (!this._storage) {
      this.presentToast('Błąd zapisu: Storage nie jest dostępny.', 'danger');
      return;
    }

    try {
      const notes: Note[] = (await this._storage.get('notes')) || [];
      const newNote: Note = {
        id: Date.now(),
        title: title,
        content: content
      };
      notes.unshift(newNote);
      await this._storage.set('notes', notes);
      this.presentToast('Synteza zapisana jako nowa notatka.');
      
      this.notes = notes;
      this.cdr.detectChanges();
    } catch (error) {
        console.error("Error saving synthesized note:", error);
        this.presentToast('Wystąpił błąd podczas zapisywania notatki.', 'danger');
    }
  }

  async presentToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 2500,
      color: color,
      position: 'bottom'
    });
    toast.present();
  }
}
