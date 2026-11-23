import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpcomingDeliveriesComponent } from './upcoming-deliveries.component';

describe('UpcomingDeliveriesComponent', () => {
  let component: UpcomingDeliveriesComponent;
  let fixture: ComponentFixture<UpcomingDeliveriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingDeliveriesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingDeliveriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
