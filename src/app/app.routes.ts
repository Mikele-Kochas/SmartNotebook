import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'note/new',
    loadComponent: () => import('./note-detail/note-detail.page').then( m => m.NoteDetailPage)
  },
  {
    path: 'note/:id',
    loadComponent: () => import('./note-detail/note-detail.page').then( m => m.NoteDetailPage)
  },
];
