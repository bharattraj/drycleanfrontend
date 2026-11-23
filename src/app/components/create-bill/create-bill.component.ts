import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Subject, of } from 'rxjs';
import { BillService, BillResponse } from '../../services/bill.service';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  takeUntil,
} from 'rxjs/operators';

import { CustomerService, Customer } from '../../services/customer.service';

// Defines the structure of each product row in the bill.
interface ProductRow {
  id: number;
  category: string;
  product: string;
  quantity: number;
  amount: number;
}

@Component({
  selector: 'app-create-bill',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './create-bill.component.html',
  styleUrl: './create-bill.component.css',
})
export class CreateBillComponent implements OnInit, OnDestroy {
  // Inject services used for customer operations and bill creation.
  constructor(
    private customerService: CustomerService,
    private billService: BillService,
  ) {}

  // Used to clean up subscriptions when the component is destroyed.
  private destroy$ = new Subject<void>();

  // Emits phone numbers entered by staff for autocomplete search.
  private phoneSearch$ = new Subject<string>();

  // =========================================================
  // BILL DETAILS
  // =========================================================

  physicalBillNumber = '';
  expectedDeliveryDate = '';
  isSavingBill = false;

  saveSuccessMessage = '';
  savedBill: BillResponse | null = null;

  showBillSuccessPopup = false;
  showBillFailurePopup = false;
  billFailureMessage = '';

  // =========================================================
  // CUSTOMER DETAILS
  // =========================================================

  // ID of the currently selected existing customer.
  // This ID is managed by the backend and is not editable.
  selectedCustomerId: number | null = null;

  // Original customer details are stored so that we can
  // identify whether the staff changed the name or address.
  originalCustomerName = '';
  originalCustomerAddress = '';

  // Values entered or selected by staff.
  customerPhone = '';
  customerName = '';
  customerAddress = '';

  // Customers returned by phone-number autocomplete search.
  filteredCustomers: Customer[] = [];

  showSuggestions = false;

  // True when staff selects an existing customer.
  isExistingCustomerSelected = false;

  // True when staff explicitly chooses Create New Customer.
  createNewCustomerAnyway = false;

  isSearchingCustomers = false;
  customerSearchError = '';

  validationMessage = '';

  // =========================================================
  // COMPONENT INITIALIZATION
  // =========================================================

  ngOnInit(): void {
    // Listen for phone numbers entered by staff.
    this.phoneSearch$
      .pipe(
        // Wait 300ms after typing before making an API request.
        debounceTime(300),

        // Avoid searching again if the phone number has not changed.
        distinctUntilChanged(),

        // Cancel the previous search when a new phone number is entered.
        switchMap((phone) => {
          // Do not search for fewer than 3 digits.
          if (phone.length < 3) {
            this.isSearchingCustomers = false;
            return of([]);
          }

          this.isSearchingCustomers = true;
          this.customerSearchError = '';

          // Search customers using the entered phone number.
          return this.customerService.searchCustomersByPhone(phone).pipe(
            // Handle autocomplete API errors without breaking the stream.
            catchError(() => {
              this.customerSearchError =
                'Unable to search customers. Please try again.';

              return of([]);
            }),
          );
        }),

        // Automatically unsubscribe when the component is destroyed.
        takeUntil(this.destroy$),
      )

      // Receive the matching customers and display suggestions.
      .subscribe((customers) => {
        this.filteredCustomers = customers;
        this.isSearchingCustomers = false;

        // Show suggestions only when staff has not selected
        // an existing customer or explicitly chosen a new customer.
        if (
          this.customerPhone.trim().length >= 3 &&
          !this.isExistingCustomerSelected &&
          !this.createNewCustomerAnyway
        ) {
          this.showSuggestions = true;
        }
      });
  }

  // =========================================================
  // COMPONENT DESTRUCTION
  // =========================================================

  ngOnDestroy(): void {
    // Notify all subscriptions that the component is being destroyed.
    this.destroy$.next();
    this.destroy$.complete();
  }

  // =========================================================
  // PHONE INPUT AND CUSTOMER SEARCH
  // =========================================================

  onPhoneInput(): void {
    // A changed phone number means the previous selection is invalid.
    this.selectedCustomerId = null;
    this.isExistingCustomerSelected = false;
    this.createNewCustomerAnyway = false;

    // Clear customer details when a new phone number is entered.
    this.customerName = '';
    this.customerAddress = '';

    this.originalCustomerName = '';
    this.originalCustomerAddress = '';

    this.customerSearchError = '';

    const phone = this.customerPhone.trim();

    // Allow only numeric characters in the phone number.
    if (!/^\d*$/.test(phone)) {
      this.customerPhone = phone.replace(/\D/g, '');
    }

    // Do not search until at least 3 digits are entered.
    if (this.customerPhone.length < 3) {
      this.filteredCustomers = [];
      this.showSuggestions = false;
      this.isSearchingCustomers = false;
      return;
    }

    // Show autocomplete suggestions and start the search.
    this.showSuggestions = true;
    this.isSearchingCustomers = true;

    this.phoneSearch$.next(this.customerPhone);
  }

  // =========================================================
  // SELECT EXISTING CUSTOMER
  // =========================================================

  selectCustomer(customer: Customer): void {
    // Automatically fill the selected customer's information.
    this.customerPhone = customer.phone;
    this.customerName = customer.name;
    this.customerAddress = customer.address || '';

    // Store the existing customer ID.
    this.selectedCustomerId = customer.id;

    // Store original values for comparison when saving the bill.
    this.originalCustomerName = customer.name.trim();
    this.originalCustomerAddress = (customer.address || '').trim();

    // Mark this as an existing customer selection.
    this.isExistingCustomerSelected = true;
    this.createNewCustomerAnyway = false;

    // Hide autocomplete suggestions after selection.
    this.showSuggestions = false;
    this.filteredCustomers = [];
    this.customerSearchError = '';
  }

  // =========================================================
  // CREATE NEW CUSTOMER OPTION
  // =========================================================

  createNewCustomer(): void {
    // Clear name and address so staff can enter new details.
    this.customerName = '';
    this.customerAddress = '';

    // No existing customer ID is selected.
    this.selectedCustomerId = null;

    this.isExistingCustomerSelected = false;

    // Remember that staff explicitly selected Create New Customer.
    this.createNewCustomerAnyway = true;

    // Hide autocomplete suggestions.
    this.showSuggestions = false;
    this.filteredCustomers = [];
    this.customerSearchError = '';

    // Clear original customer details.
    this.originalCustomerName = '';
    this.originalCustomerAddress = '';
  }

  // =========================================================
  // PRODUCT CATALOGUE
  // =========================================================

  // Available product categories.
  categories: string[] = [
    'Washing',
    'Dry Cleaning',
    'Ironing',
    'Premium Laundry',
  ];

  // Products available under each category.
  productsByCategory: { [key: string]: string[] } = {
    Washing: ['Shirt', 'Trouser', 'T-Shirt', 'Jeans', 'Bedsheet'],
    'Dry Cleaning': ['Suit', 'Blazer', 'Saree', 'Lehenga', 'Jacket'],
    Ironing: ['Shirt', 'Trouser', 'T-Shirt', 'Saree'],
    'Premium Laundry': ['Curtain', 'Blanket', 'Comforter', 'Carpet'],
  };

  // =========================================================
  // DYNAMIC PRODUCT ROWS
  // =========================================================

  // Every row gets a unique ID for Angular tracking.
  private nextRowId = 1;

  // Start with one empty product row.
  productRows: ProductRow[] = [this.createEmptyRow()];

  // Creates a new empty product row with default values.
  private createEmptyRow(): ProductRow {
    return {
      id: this.nextRowId++,
      category: '',
      product: '',
      quantity: 1,
      amount: 0,
    };
  }

  // Add another product row to the bill.
  addProductRow(): void {
    this.productRows.push(this.createEmptyRow());
  }

  // Remove a product row and recalculate the bill total.
  removeProductRow(id: number): void {
    this.productRows = this.productRows.filter((row) => row.id !== id);
    this.calculateTotal();
  }

  // Clear the selected product when its category changes.
  onCategoryChange(row: ProductRow): void {
    row.product = '';
  }

  // Return products that have not already been selected
  // under the same category in another row.
  getAvailableProducts(row: ProductRow): string[] {
    const categoryProducts = this.productsByCategory[row.category] || [];

    return categoryProducts.filter((product) => {
      const alreadySelected = this.productRows.some(
        (otherRow) =>
          otherRow.id !== row.id &&
          otherRow.category === row.category &&
          otherRow.product === product,
      );

      return !alreadySelected;
    });
  }

  // =========================================================
  // AMOUNT CALCULATION
  // =========================================================

  totalAmount = 0;

  // Calculate the total using the amount of every product row.
  calculateTotal(): void {
    this.totalAmount = this.productRows.reduce(
      (total, row) => total + (Number(row.amount) || 0),
      0,
    );
  }

  // =========================================================
  // BILL VALIDATION AND SAVING
  // =========================================================

  saveBill(): void {
    // Clear previous validation and success messages.
    this.validationMessage = '';
    this.saveSuccessMessage = '';

    // Prevent multiple submissions while an API request is running.
    if (this.isSavingBill) {
      return;
    }

    // Validate physical bill number.
    if (!this.physicalBillNumber.trim()) {
      this.validationMessage = 'Please enter the physical bill number.';
      return;
    }

    // Validate the 10-digit mobile number.
    if (!/^\d{10}$/.test(this.customerPhone)) {
      this.validationMessage = 'Please enter a valid 10-digit mobile number.';
      return;
    }

    // Validate customer name.
    if (!this.customerName.trim()) {
      this.validationMessage = 'Please enter customer name.';
      return;
    }

    // Validate customer address.
    if (!this.customerAddress.trim()) {
      this.validationMessage = 'Please enter customer address.';
      return;
    }

    // Validate expected delivery date.
    if (!this.expectedDeliveryDate) {
      this.validationMessage = 'Please select expected delivery date.';
      return;
    }

    // At least one product row is required.
    if (this.productRows.length === 0) {
      this.validationMessage = 'Please add at least one product.';
      return;
    }

    // Validate every product row.
    for (const row of this.productRows) {
      if (!row.category || !row.product) {
        this.validationMessage =
          'Please select category and product for every row.';
        return;
      }

      if (
        !Number.isInteger(Number(row.quantity)) ||
        Number(row.quantity) <= 0
      ) {
        this.validationMessage =
          'Product quantity must be a positive whole number.';
        return;
      }

      if (
        row.amount === null ||
        row.amount === undefined ||
        !Number.isFinite(Number(row.amount)) ||
        Number(row.amount) < 0
      ) {
        this.validationMessage = 'Please enter a valid product amount.';
        return;
      }
    }

    // Validate the total amount.
    if (
      !Number.isFinite(Number(this.totalAmount)) ||
      Number(this.totalAmount) < 0
    ) {
      this.validationMessage = 'Please enter a valid total amount.';
      return;
    }

    // An existing customer must have a valid selected ID.
    if (this.isExistingCustomerSelected && this.selectedCustomerId === null) {
      this.validationMessage = 'Please select the existing customer again.';
      return;
    }

    // Staff must either select an existing customer
    // or explicitly choose Create New Customer.
    if (!this.isExistingCustomerSelected && !this.createNewCustomerAnyway) {
      this.validationMessage =
        'Please select an existing customer or choose Create New Customer.';
      return;
    }

    // All validations passed. Start the saving process.
    this.isSavingBill = true;

    // EXISTING CUSTOMER:
    // Decide whether to reuse the ID, update address, or create a new customer.
    if (this.isExistingCustomerSelected) {
      this.saveBillForExistingCustomer();
      return;
    }

    // NEW CUSTOMER:
    // First check whether an identical customer already exists.
    this.saveBillForNewCustomer();
  }

  // =========================================================
  // NEW CUSTOMER DUPLICATE VERIFICATION
  // =========================================================

  private saveBillForNewCustomer(): void {
    // Read and trim the details entered by staff.
    const name = this.customerName.trim();
    const phone = this.customerPhone.trim();
    const address = this.customerAddress.trim();

    // Search all existing customers having this exact phone number.
    this.customerService.getCustomersByExactPhone(phone).subscribe({
      next: (customers) => {
        // Look for an exact match using phone, name and address.
        // Name and address comparison ignores letter case and
        // leading/trailing spaces.
        const existingCustomer = customers.find(
          (customer) =>
            customer.name.trim().toLowerCase() === name.toLowerCase() &&
            (customer.address || '').trim().toLowerCase() ===
              address.toLowerCase(),
        );

        // CASE 1:
        // An identical customer already exists.
        if (existingCustomer) {
          console.log(
            'Identical customer found. Reusing customer ID:',
            existingCustomer.id,
          );

          // Reuse the existing customer ID.
          // Do not create another customer.
          this.submitBill(existingCustomer.id, null);

          return;
        }

        // CASE 2:
        // No identical customer exists.
        // Create a new customer through the existing bill API flow.
        console.log('No identical customer found. Creating a new customer.');

        this.submitBill(null, {
          name,
          phone,
          address,
        });
      },

      // If verification fails, do not create a customer or bill.
      error: (error) => {
        console.error('Customer verification failed:', error);

        this.isSavingBill = false;

        this.billFailureMessage =
          'Unable to verify existing customer details. Bill was not saved. Please try again.';

        this.showBillFailurePopup = true;
      },
    });
  }

  // =========================================================
  // EXISTING CUSTOMER DECISION
  // =========================================================

  private saveBillForExistingCustomer(): void {
    const customerId = this.selectedCustomerId!;

    // Get the current edited values.
    const currentName = this.customerName.trim();
    const currentAddress = this.customerAddress.trim();

    // Compare current values against the original customer details.
    const nameChanged = currentName !== this.originalCustomerName;

    const addressChanged = currentAddress !== this.originalCustomerAddress;

    // CASE 1:
    // Name changed.
    // Create a separate customer with the edited name and address.
    if (nameChanged) {
      this.customerService
        .createCustomer({
          name: currentName,
          phone: this.customerPhone.trim(),
          address: currentAddress,
        })
        .subscribe({
          next: (newCustomer) => {
            console.log('New customer created:', newCustomer);

            // Use the newly generated customer ID for this bill.
            this.submitBill(newCustomer.id, null);
          },

          error: (error) => this.handleCustomerSaveError(error),
        });

      return;
    }

    // CASE 2:
    // Name is unchanged but address has changed.
    // Update the existing customer's address and retain the same ID.
    if (addressChanged) {
      this.customerService
        .updateCustomerAddress(customerId, {
          address: currentAddress,
        })
        .subscribe({
          next: (updatedCustomer) => {
            console.log('Customer address updated:', updatedCustomer);

            // Continue with the same customer ID.
            this.submitBill(updatedCustomer.id, null);
          },

          error: (error) => this.handleCustomerSaveError(error),
        });

      return;
    }

    // CASE 3:
    // Neither name nor address has changed.
    // Reuse the existing customer ID directly.
    this.submitBill(customerId, null);
  }

  // =========================================================
  // COMMON BILL SUBMISSION
  // =========================================================

  private submitBill(
    customerId: number | null,
    customer: {
      name: string;
      phone: string;
      address: string;
    } | null,
  ): void {
    // Prepare the request body expected by the backend.
    const billData = {
      billNumber: this.physicalBillNumber.trim(),

      // Existing customer: send customerId.
      // New customer: send null customerId and customer details.
      customerId: customerId,
      customer: customer,

      expectedDeliveryDate: this.expectedDeliveryDate,
      totalAmount: Number(this.totalAmount),

      // Convert frontend product rows into backend request format.
      products: this.productRows.map((row) => ({
        category: row.category,
        productType: row.product,
        quantity: Number(row.quantity),
        amount: Number(row.amount),
      })),
    };

    // Call backend API to save the bill.
    this.billService.createBill(billData).subscribe({
      // BILL SAVED SUCCESSFULLY.
      next: (response: BillResponse) => {
        this.isSavingBill = false;

        // Store the backend response for the success popup.
        this.savedBill = response;
        this.showBillSuccessPopup = true;
        this.saveSuccessMessage = '';

        console.log('Saved Bill Response:', response);

        console.log(
          'SAVED BILL API RESPONSE:',
          JSON.stringify(response, null, 2),
        );
      },

      // BILL SAVE FAILED.
      error: (error) => {
        this.isSavingBill = false;

        this.handleBillSaveError(error);
      },
    });
  }

  // =========================================================
  // CUSTOMER SAVE ERROR
  // =========================================================

  private handleCustomerSaveError(error: any): void {
    this.isSavingBill = false;

    // Display the backend error if available.
    this.billFailureMessage =
      error.error?.message ||
      error.error?.error ||
      'Unable to save customer details. Bill was not saved. Please try again.';

    this.showBillFailurePopup = true;

    console.error('Customer save error:', error);
  }

  // =========================================================
  // BILL SAVE ERROR
  // =========================================================

  private handleBillSaveError(error: any): void {
    this.isSavingBill = false;

    // Read the backend error message.
    const backendMessage =
      error.error?.message ||
      error.error?.error ||
      error.message ||
      'Unable to save bill. Please try again.';

    const message = String(backendMessage).toLowerCase();

    // Give a clear message when the physical bill number is duplicated.
    if (
      message.includes('already exists') ||
      message.includes('duplicate') ||
      message.includes('already registered')
    ) {
      this.billFailureMessage =
        'This physical bill number is already registered. Please check the bill number and enter a different one.';
    } else {
      this.billFailureMessage = String(backendMessage);
    }

    this.showBillFailurePopup = true;

    console.error('Bill save error:', error);
  }

  // =========================================================
  // POPUP CONTROLS
  // =========================================================

  // Close the successful bill popup.
  closeBillSuccessPopup(): void {
    this.showBillSuccessPopup = false;
    this.savedBill = null;
  }

  // Close the failed bill popup.
  closeBillFailurePopup(): void {
    this.showBillFailurePopup = false;
    this.billFailureMessage = '';
  }
}
