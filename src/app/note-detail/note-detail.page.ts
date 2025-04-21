import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonItem,
  IonInput,
  IonTextarea,
  IonButton,
  IonIcon,
  ToastController,
  AlertController,
  ActionSheetController,
  LoadingController,
} from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { Storage } from '@ionic/storage-angular';
import { addIcons } from 'ionicons';
import { saveOutline, trashOutline, createOutline, sparklesOutline, constructOutline, chatboxEllipsesOutline, close } from 'ionicons/icons';
import { GeminiService, RevisionMode } from '../services/gemini.service';

interface Note {
  id: number | null;
  title: string;
  content: string;
}

@Component({
  selector: 'app-note-detail',
  templateUrl: './note-detail.page.html',
  styleUrls: ['./note-detail.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonBackButton,
    IonButtons,
    IonItem,
    IonInput,
    IonTextarea,
    IonButton,
    IonIcon,
  ],
})
export class NoteDetailPage implements OnInit {
  note: Note = { id: null, title: '', content: '' };
  isNewNote: boolean = true;
  private _storage: Storage | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private storage: Storage,
    private toastController: ToastController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private loadingController: LoadingController,
    private geminiService: GeminiService,
    private cdr: ChangeDetectorRef
  ) {
    addIcons({ saveOutline, trashOutline, createOutline, sparklesOutline, constructOutline, chatboxEllipsesOutline, close });
    this.initStorage();
  }

  async initStorage() {
    if (!this._storage) {
      this._storage = await this.storage.create();
    }
  }

  async ngOnInit() {
    await this.initStorage();
    const idParam = this.route.snapshot.paramMap.get('id');

    if (idParam && idParam !== 'new') {
      const noteId = parseInt(idParam, 10);
      this.isNewNote = false;
      await this.loadNote(noteId);
    } else {
      this.isNewNote = true;
      this.note = { id: null, title: '', content: '' };
    }
  }

  async loadNote(id: number) {
    if (!this._storage) return;
    const notes: Note[] = (await this._storage.get('notes')) || [];
    const foundNote = notes.find(n => n.id === id);
    if (foundNote) {
      this.note = { ...foundNote };
    } else {
      this.presentToast('Nie znaleziono notatki.');
      this.router.navigate(['/home']);
    }
  }

  async saveNote() {
    if (!this._storage) return;
    if (!this.note.title && !this.note.content) {
        this.presentToast('Notatka nie może być pusta.', 'warning');
        return;
    }

    const notes: Note[] = (await this._storage.get('notes')) || [];

    if (this.isNewNote) {
      const newNote: Note = {
        id: Date.now(),
        title: this.note.title || '',
        content: this.note.content || ''
      };
      notes.push(newNote);
      await this._storage.set('notes', notes);
      this.presentToast('Notatka zapisana.');
      this.router.navigate(['/home']);
    } else {
      const index = notes.findIndex(n => n.id === this.note.id);
      if (index > -1) {
        notes[index] = {
            id: this.note.id!,
            title: this.note.title || '',
            content: this.note.content || ''
        };
        await this._storage.set('notes', notes);
        this.presentToast('Notatka zaktualizowana.');
        this.router.navigate(['/home']);
      } else {
        this.presentToast('Błąd podczas aktualizacji notatki.');
      }
    }
  }

  async deleteNote() {
    if (this.isNewNote || !this.note.id || !this._storage) return;

    const notes: Note[] = (await this._storage.get('notes')) || [];
    const updatedNotes = notes.filter(n => n.id !== this.note.id);
    await this._storage.set('notes', updatedNotes);
    this.presentToast('Notatka usunięta.', 'danger');
    this.router.navigate(['/home']);
  }

  goBack() {
    this.router.navigate(['/home']);
  }

  async presentToast(message: string, color: string = 'success') {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      color: color,
      position: 'bottom'
    });
    toast.present();
  }

  async presentRevisionOptions() {
    if (!this.note.content) {
        const toast = await this.toastController.create({
            message: 'Brak treści do redagowania.',
            duration: 2000
        });
        await toast.present();
        return;
    }
    const actionSheet = await this.actionSheetController.create({
      header: 'Tryb redakcji Gemini',
      buttons: [
        {
          text: 'Lekka redakcja (literówki, interpunkcja)',
          icon: 'sparkles-outline',
          handler: () => {
            this.callGeminiRevision('light');
          }
        },
        {
          text: 'Głęboka redakcja (styl, struktura)',
          icon: 'construct-outline',
          handler: () => {
            this.callGeminiRevision('deep');
          }
        },
        {
          text: 'Niestandardowa redakcja (podaj prompt)',
          icon: 'chatbox-ellipses-outline',
          handler: () => {
            this.presentCustomPrompt();
          }
        },
        {
          text: 'Anuluj',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  async presentCustomPrompt() {
    const alert = await this.alertController.create({
      header: 'Niestandardowa redakcja',
      message: 'Wpisz polecenie, co Gemini ma zrobić z tekstem notatki.',
      inputs: [
        {
          name: 'prompt',
          type: 'textarea',
          placeholder: 'Np. Popraw błędy, Podsumuj tekst, Zmień styl na formalny'
        }
      ],
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel',
        },
        {
          text: 'Redaguj',
          handler: (data) => {
            if (data.prompt && data.prompt.trim()) {
              this.callGeminiRevision('custom', data.prompt.trim());
            } else {
              this.toastController.create({
                message: 'Prompt nie może być pusty.',
                duration: 2000
              }).then(toast => toast.present());
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async callGeminiRevision(mode: RevisionMode, prompt?: string) {
    const currentContent = this.note.content;

    if (!currentContent) {
      console.warn('No content to revise.');
      const toast = await this.toastController.create({ message: 'Brak treści do redagowania.', duration: 2000 });
      await toast.present();
      return;
    }

    const loading = await this.loadingController.create({
      message: 'Gemini redaguje notatkę...',
      spinner: 'crescent'
    });
    await loading.present();

    this.geminiService.reviseNote(currentContent, mode, prompt)
      .subscribe({
        next: (revisedContent) => {
          this.note.content = revisedContent;
          console.log('Revision successful, content updated.');
          loading.dismiss();
          this.cdr.detectChanges();
        },
        error: (err) => {
          loading.dismiss();
          console.error('Error during Gemini revision:', err);
          let errorMessage = 'Wystąpił błąd podczas redagowania przez Gemini.';
          if (err instanceof Error) {
            errorMessage = err.message;
          }
          this.toastController.create({
            message: errorMessage,
            duration: 3000,
            color: 'danger'
          }).then(toast => toast.present());
        }
      });
  }
}
