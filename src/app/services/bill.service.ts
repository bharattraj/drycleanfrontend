import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Customer } from './customer.service';

export interface CreateProductRequest {
  category: string;
  productType: string;
  quantity: number;
  amount: number;
}

export interface CreateBillRequest {
  billNumber: string;
  customerId: number | null;
  customer: {
    name: string;
    phone: string;
    address: string;
  } | null;
  expectedDeliveryDate: string;
  totalAmount: number;
  products: CreateProductRequest[];
}

export interface BillResponse {
  id: number;
  billNumber: string;
  customer: Customer | null;
  billDate: string;
  expectedDeliveryDate: string;
  processStatus: string;
  totalAmount: number;
  products: ProductResponse[];
}

export interface ProductResponse {
  id: number;
  category: string;
  productType: string;
  quantity: number;
  amount: number;
}

@Injectable({
  providedIn: 'root',
})
export class BillService {
  private readonly apiUrl = '/api/bills';

  constructor(private http: HttpClient) {}

  // Create a new bill.
  createBill(request: CreateBillRequest): Observable<BillResponse> {
    return this.http.post<BillResponse>(this.apiUrl, request);
  }

  // Fetch a bill using its physical bill number.
  getBillByNumber(billNumber: string): Observable<BillResponse> {
    return this.http.get<BillResponse>(
      `${this.apiUrl}/${encodeURIComponent(billNumber)}`,
    );
  }

  // Fetch a bill using its unique database ID (QR code lookup).
  getBillById(billId: number): Observable<BillResponse> {
    return this.http.get<BillResponse>(`${this.apiUrl}/by-id/${billId}`);
  }

  // Fetch bills belonging to a particular customer.
  getBillsByCustomer(customerId: number): Observable<BillResponse[]> {
    return this.http.get<BillResponse[]>(
      `${this.apiUrl}/customer/${customerId}`,
    );
  }

  // Fetch all bills which are not yet delivered.
  getPendingBills(): Observable<BillResponse[]> {
    return this.http.get<BillResponse[]>(`${this.apiUrl}/pending`);
  }

  // Confirm clothes verification and move the bill to the next process stage.
  confirmProcess(
    billNumber: string,
    request: ConfirmProcessRequest,
  ): Observable<BillResponse> {
    return this.http.post<BillResponse>(
      `${this.apiUrl}/${encodeURIComponent(billNumber)}/process`,
      request,
    );
  }
}

// Actual quantity counted by staff for each product.
export interface ProductQuantityVerificationRequest {
  productId: number;
  verifiedQuantity: number;
}

// Request sent when staff confirms a process stage.
export interface ConfirmProcessRequest {
  targetStatus: string;
  products: ProductQuantityVerificationRequest[];
}
