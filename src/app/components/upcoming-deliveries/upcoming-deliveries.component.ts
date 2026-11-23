import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { BillService, BillResponse } from '../../services/bill.service';

type DeliveryView = 'today' | 'date' | 'all' | 'status';

@Component({
  selector: 'app-upcoming-deliveries',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './upcoming-deliveries.component.html',
  styleUrl: './upcoming-deliveries.component.css',
})
export class UpcomingDeliveriesComponent implements OnInit {
  constructor(private billService: BillService) {}

  // Current selected dashboard view.
  activeView: DeliveryView = 'today';

  // All pending bills received from backend.
  bills: BillResponse[] = [];

  // Date selected for date-range filtering.
  selectedDate = this.getTodayDate();

  // Selected process status.
  selectedStatus = '';

  // Loading and error states.
  isLoading = false;
  errorMessage = '';

  // Bill whose details are currently expanded.
  expandedBillId: number | null = null;

  // Current date in local YYYY-MM-DD format.
  today = this.getTodayDate();

  // Available process statuses (Delivered is intentionally excluded).
  readonly statusOptions = [
    { value: 'RECEIVED', label: 'प्राप्त हुआ / Received' },
    { value: 'UNDER_PROCESSING', label: 'काम चल रहा है / Under Processing' },
    { value: 'READY_FOR_SHOP', label: 'दुकान भेजना है / Ready for Shop' },
    {
      value: 'READY_FOR_DELIVERY',
      label: 'डिलीवरी के लिए तैयार / Ready for Delivery',
    },
  ];

  // Priority order for bills having the same expected delivery date.
  private readonly statusPriority: Record<string, number> = {
    READY_FOR_DELIVERY: 1,
    READY_FOR_SHOP: 2,
    UNDER_PROCESSING: 3,
    RECEIVED: 4,
  };

  ngOnInit(): void {
    this.loadPendingBills();
  }

  // Fetch all bills that have not been delivered.
  loadPendingBills(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.billService.getPendingBills().subscribe({
      next: (bills) => {
        this.bills = this.sortBills(bills);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Upcoming deliveries error:', error);

        this.errorMessage =
          'बिल लोड करने में समस्या हुई। कृपया दोबारा प्रयास करें।';

        this.isLoading = false;
      },
    });
  }

  // Return today's date using the device's local date.
  private getTodayDate(): string {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // Sort bills by delivery date, then by process priority.
  private sortBills(bills: BillResponse[]): BillResponse[] {
    return [...bills].sort((a, b) => {
      const dateComparison = a.expectedDeliveryDate.localeCompare(
        b.expectedDeliveryDate,
      );

      if (dateComparison !== 0) {
        return dateComparison;
      }

      const priorityA =
        this.statusPriority[this.normalizeStatus(a.processStatus)] ?? 99;

      const priorityB =
        this.statusPriority[this.normalizeStatus(b.processStatus)] ?? 99;

      return priorityA - priorityB;
    });
  }

  // Normalize status values before comparing them.
  private normalizeStatus(status: string): string {
    return (status || '').trim().toUpperCase();
  }

  // Number of bills whose expected delivery date has passed.
  get overdueCount(): number {
    return this.bills.filter((bill) => bill.expectedDeliveryDate < this.today)
      .length;
  }

  // Number of bills expected today.
  get todayCount(): number {
    return this.bills.filter((bill) => bill.expectedDeliveryDate === this.today)
      .length;
  }

  // Return bills according to the currently selected view.
  get visibleBills(): BillResponse[] {
    let filteredBills: BillResponse[] = [];

    switch (this.activeView) {
      case 'today':
        // Only bills expected to be delivered today.
        filteredBills = this.bills.filter(
          (bill) => bill.expectedDeliveryDate === this.today,
        );
        break;

      case 'date':
        // Include overdue bills and bills due up to selected date.
        if (!this.selectedDate) {
          filteredBills = [];
          break;
        }

        filteredBills = this.bills.filter(
          (bill) =>
            bill.expectedDeliveryDate < this.today ||
            bill.expectedDeliveryDate <= this.selectedDate,
        );
        break;

      case 'all':
        // All undelivered bills.
        filteredBills = [...this.bills];
        break;

      case 'status':
        // Only bills matching the selected process status.
        if (!this.selectedStatus) {
          filteredBills = [];
          break;
        }

        filteredBills = this.bills.filter(
          (bill) =>
            this.normalizeStatus(bill.processStatus) === this.selectedStatus,
        );
        break;
    }

    return this.sortBills(filteredBills);
  }

  // Change the dashboard view.
  setView(view: DeliveryView): void {
    this.activeView = view;
    this.expandedBillId = null;
  }

  // Toggle bill details open or closed.
  toggleBillDetails(billId: number): void {
    this.expandedBillId = this.expandedBillId === billId ? null : billId;
  }

  // Check whether a bill is overdue.
  isOverdue(bill: BillResponse): boolean {
    return bill.expectedDeliveryDate < this.today;
  }

  // Check whether a bill is due today.
  isDueToday(bill: BillResponse): boolean {
    return bill.expectedDeliveryDate === this.today;
  }

  // Display a useful delivery-date label.
  getDeliveryLabel(bill: BillResponse): string {
    if (this.isOverdue(bill)) {
      return 'देरी हो चुकी है / Overdue';
    }

    if (this.isDueToday(bill)) {
      return 'आज डिलीवरी / Due Today';
    }

    return 'आगामी / Upcoming';
  }

  // Display process status in Hindi and English.
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      RECEIVED: 'प्राप्त हुआ / Received',
      UNDER_PROCESSING: 'काम चल रहा है / Under Processing',
      READY_FOR_SHOP: 'दुकान भेजना है / Ready for Shop',
      READY_FOR_DELIVERY: 'डिलीवरी के लिए तैयार / Ready for Delivery',
      DELIVERED: 'डिलीवर हो गया / Delivered',
    };

    const normalized = this.normalizeStatus(status);

    return labels[normalized] ?? status;
  }

  // Return a CSS class according to delivery urgency.
  getDeliveryClass(bill: BillResponse): string {
    if (this.isOverdue(bill)) {
      return 'overdue';
    }

    if (this.isDueToday(bill)) {
      return 'due-today';
    }

    return 'upcoming';
  }

  // Return a CSS class according to process status.
  getStatusClass(status: string): string {
    const normalized = this.normalizeStatus(status);

    const classes: Record<string, string> = {
      RECEIVED: 'status-received',
      UNDER_PROCESSING: 'status-processing',
      READY_FOR_SHOP: 'status-shop',
      READY_FOR_DELIVERY: 'status-ready',
    };

    return classes[normalized] ?? '';
  }

  // Format a date for display without UTC date shifting.
  formatDate(date: string): string {
    if (!date) {
      return 'उपलब्ध नहीं / N/A';
    }

    const parts = date.split('-');

    if (parts.length !== 3) {
      return date;
    }

    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // Count products in a bill.
  getTotalQuantity(bill: BillResponse): number {
    return (bill.products || []).reduce(
      (total, product) => total + product.quantity,
      0,
    );
  }
}
