import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
}

export interface CreateCustomerRequest {
  name: string;
  phone: string;
  address: string;
}

@Injectable({
  providedIn: 'root',
})
export class CustomerService {
  private readonly apiUrl = '/api/customers';

  constructor(private http: HttpClient) {}

  getAllCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(this.apiUrl);
  }

  searchCustomersByPhone(phone: string): Observable<Customer[]> {
    return this.http.get<Customer[]>(
      `${this.apiUrl}/search/phone?phone=${encodeURIComponent(phone)}`,
    );
  }

  getCustomersByExactPhone(phone: string): Observable<Customer[]> {
    return this.http.get<Customer[]>(
      `${this.apiUrl}/phone/${encodeURIComponent(phone)}`,
    );
  }

  createCustomer(request: CreateCustomerRequest): Observable<Customer> {
    return this.http.post<Customer>(this.apiUrl, request);
  }

  updateCustomerAddress(
    customerId: number,
    request: UpdateCustomerAddressRequest,
  ): Observable<Customer> {
    return this.http.patch<Customer>(
      `${this.apiUrl}/${customerId}/address`,
      request,
    );
  }
}
export interface UpdateCustomerAddressRequest {
  address: string;
}
