import { Routes } from '@angular/router';

import { HomeComponent } from './components/home/home.component';
import { CreateBillComponent } from './components/create-bill/create-bill.component';
import { SearchBillComponent } from './components/search-bill/search-bill.component';
import { UpcomingDeliveriesComponent } from './components/upcoming-deliveries/upcoming-deliveries.component';
import { ProcessComponent } from './components/process/process.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  { path: 'home', component: HomeComponent },

  { path: 'create-bill', component: CreateBillComponent },

  { path: 'search-bill', component: SearchBillComponent },

  { path: 'upcoming-deliveries', component: UpcomingDeliveriesComponent },

  // Process management page.
  { path: 'process', component: ProcessComponent },

  { path: '**', redirectTo: 'home' },
];
