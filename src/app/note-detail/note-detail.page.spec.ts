import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoteDetailPage } from './note-detail.page';

describe('NoteDetailPage', () => {
  let component: NoteDetailPage;
  let fixture: ComponentFixture<NoteDetailPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NoteDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
