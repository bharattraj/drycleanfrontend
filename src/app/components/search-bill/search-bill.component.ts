import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { forkJoin, of, Subject } from 'rxjs';

import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  switchMap,
  takeUntil,
} from 'rxjs/operators';

import { BillService, BillResponse } from '../../services/bill.service';
import { CustomerService, Customer } from '../../services/customer.service';

type SearchMode = 'bill' | 'phone';

@Component({
  selector: 'app-search-bill',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './search-bill.component.html',
  styleUrl: './search-bill.component.css',
})
export class SearchBillComponent implements OnInit, OnDestroy {
  constructor(
    private billService: BillService,
    private customerService: CustomerService,
  ) {}

  // Subscriptions को component बंद होने पर रोकने के लिए।
  private destroy$ = new Subject<void>();

  // Phone autocomplete के लिए search event.
  private phoneSearch$ = new Subject<string>();

  // Search form data.
  searchMode: SearchMode = 'bill';
  billNumber = '';
  phoneNumber = '';

  // Customer autocomplete data.
  filteredCustomers: Customer[] = [];
  selectedCustomer: Customer | null = null;
  showSuggestions = false;
  isSearchingCustomers = false;
  customerSearchError = '';

  // Search result data.
  bills: BillResponse[] = [];
  isSearching = false;
  hasSearched = false;
  errorMessage = '';

  // Delivered bills section default में बंद रहेगा।
  showDeliveredBills = false;

  // केवल non-delivered bills.
  get activeBills(): BillResponse[] {
    return this.bills.filter(
      (bill) => this.getNormalizedStatus(bill.processStatus) !== 'DELIVERED',
    );
  }

  // केवल delivered bills.
  get deliveredBills(): BillResponse[] {
    return this.bills.filter(
      (bill) => this.getNormalizedStatus(bill.processStatus) === 'DELIVERED',
    );
  }

  // Component initialization.
  ngOnInit(): void {
    this.phoneSearch$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),

        switchMap((phone) => {
          if (phone.length < 3) {
            this.isSearchingCustomers = false;
            return of([] as Customer[]);
          }

          this.isSearchingCustomers = true;
          this.customerSearchError = '';

          return this.customerService.searchCustomersByPhone(phone).pipe(
            catchError((error) => {
              console.error('Customer autocomplete error:', error);

              this.customerSearchError =
                'ग्राहक खोजने में समस्या हुई। दोबारा प्रयास करें।';

              return of([] as Customer[]);
            }),
          );
        }),

        takeUntil(this.destroy$),
      )
      .subscribe((customers) => {
        this.filteredCustomers = customers;
        this.isSearchingCustomers = false;

        if (
          this.searchMode === 'phone' &&
          this.phoneNumber.trim().length >= 3 &&
          !this.selectedCustomer
        ) {
          this.showSuggestions = true;
        }
      });
  }

  // Component बंद होने पर subscriptions बंद करें।
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Bill Number और Phone Number search mode बदलें।
  setSearchMode(mode: SearchMode): void {
    this.searchMode = mode;

    this.clearResults();

    this.showSuggestions = false;
    this.selectedCustomer = null;
    this.filteredCustomers = [];
    this.customerSearchError = '';
    this.isSearchingCustomers = false;
  }

  // Phone input और autocomplete संभालें।
  onPhoneInput(): void {
    this.selectedCustomer = null;
    this.filteredCustomers = [];
    this.customerSearchError = '';

    // केवल numeric characters रखें।
    this.phoneNumber = this.phoneNumber.replace(/\D/g, '');

    this.clearResults();

    if (this.phoneNumber.length < 3) {
      this.showSuggestions = false;
      this.isSearchingCustomers = false;
      return;
    }

    this.showSuggestions = true;
    this.isSearchingCustomers = true;

    this.phoneSearch$.next(this.phoneNumber);
  }

  // Autocomplete से customer select करें।
  selectCustomer(customer: Customer): void {
    this.selectedCustomer = customer;
    this.phoneNumber = customer.phone;

    this.showSuggestions = false;
    this.filteredCustomers = [];
    this.customerSearchError = '';

    this.clearResults();
  }

  // Search button से मुख्य search शुरू करें।
  search(): void {
    this.clearResults();

    if (this.isSearching) {
      return;
    }

    if (this.searchMode === 'bill') {
      this.searchByBillNumber();
    } else {
      this.searchByPhoneNumber();
    }
  }

  // Physical bill number से एक bill खोजें।
  private searchByBillNumber(): void {
    const number = this.billNumber.trim();

    if (!number) {
      this.errorMessage = 'कृपया बिल नंबर दर्ज करें।';
      return;
    }

    this.isSearching = true;

    this.billService
      .getBillByNumber(number)
      .pipe(
        finalize(() => {
          this.isSearching = false;
          this.hasSearched = true;
        }),
      )
      .subscribe({
        next: (bill) => {
          this.setSortedBills([bill]);

          // अगर खोजा गया bill delivered है तो उसका section अपने आप खोलें।
          this.showDeliveredBills =
            this.getNormalizedStatus(bill.processStatus) === 'DELIVERED';
        },

        error: (error) => {
          if (error.status === 404) {
            this.errorMessage = 'इस बिल नंबर का कोई रिकॉर्ड नहीं मिला।';
          } else {
            this.errorMessage =
              'बिल खोजने में समस्या हुई। कृपया दोबारा प्रयास करें।';
          }
        },
      });
  }

  // Mobile number से customer के bills खोजें।
  private searchByPhoneNumber(): void {
    const phone = this.phoneNumber.trim();

    if (!/^\d{10}$/.test(phone)) {
      this.errorMessage = 'कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।';
      return;
    }

    this.isSearching = true;

    // CASE 1: Staff ने autocomplete से customer चुना है।
    if (this.selectedCustomer) {
      this.billService
        .getBillsByCustomer(this.selectedCustomer.id)
        .pipe(
          finalize(() => {
            this.isSearching = false;
            this.hasSearched = true;
          }),
        )
        .subscribe({
          next: (bills) => {
            this.setSortedBills(bills);

            if (this.bills.length === 0) {
              this.errorMessage = 'इस ग्राहक का कोई बिल नहीं मिला।';
            }
          },

          error: (error) => {
            console.error('Selected customer bill search error:', error);

            this.errorMessage =
              'बिल खोजने में समस्या हुई। कृपया दोबारा प्रयास करें।';
          },
        });

      return;
    }

    // CASE 2: Customer select नहीं किया गया।
    // इस phone number से जुड़े सभी customers के bills खोजें।
    this.customerService
      .searchCustomersByPhone(phone)
      .pipe(
        switchMap((customers) => {
          if (customers.length === 0) {
            return of([] as BillResponse[]);
          }

          return forkJoin(
            customers.map((customer) =>
              this.billService.getBillsByCustomer(customer.id).pipe(
                catchError((error) => {
                  console.error(
                    'Bill search failed for customer:',
                    customer.id,
                    error,
                  );

                  return of([] as BillResponse[]);
                }),
              ),
            ),
          ).pipe(map((customerBills) => customerBills.flat()));
        }),

        finalize(() => {
          this.isSearching = false;
          this.hasSearched = true;
        }),
      )
      .subscribe({
        next: (bills) => {
          this.setSortedBills(bills);

          if (this.bills.length === 0) {
            this.errorMessage = 'इस मोबाइल नंबर से कोई बिल नहीं मिला।';
          }
        },

        error: (error) => {
          console.error('Phone number bill search error:', error);

          this.errorMessage =
            'बिल खोजने में समस्या हुई। कृपया दोबारा प्रयास करें।';
        },
      });
  }

  // सभी bills को नवीनतम तारीख से पुराने क्रम में रखें।
  private setSortedBills(bills: BillResponse[]): void {
    this.bills = [...bills].sort((a, b) => {
      return (
        this.getBillDateTime(b.billDate) - this.getBillDateTime(a.billDate)
      );
    });

    // नई search के बाद delivered section बंद रखें।
    this.showDeliveredBills = false;
  }

  // Bill date को timestamp में बदलें।
  private getBillDateTime(date: string): number {
    const timestamp = new Date(date).getTime();

    // Invalid date को सबसे नीचे रखें।
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  // Status को consistent format में बदलें।
  private getNormalizedStatus(status: string): string {
    return (status || '').trim().toUpperCase();
  }

  // Delivered bills section खोलें या बंद करें।
  toggleDeliveredBills(): void {
    this.showDeliveredBills = !this.showDeliveredBills;
  }

  // पुराने results और messages हटाएं।
  clearResults(): void {
    this.bills = [];
    this.errorMessage = '';
    this.hasSearched = false;
    this.showDeliveredBills = false;
  }

  // Backend status को Hindi + English में दिखाएं।
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      RECEIVED: 'प्राप्त हुआ / Received',
      UNDER_PROCESSING: 'काम चल रहा है / Under Processing',
      READY_FOR_SHOP: 'दुकान के लिए तैयार / Ready for Shop',
      READY_FOR_DELIVERY: 'डिलीवरी के लिए तैयार / Ready for Delivery',
      DELIVERED: 'ग्राहक को दे दिया / Delivered',
    };

    return labels[this.getNormalizedStatus(status)] ?? status;
  }
}
