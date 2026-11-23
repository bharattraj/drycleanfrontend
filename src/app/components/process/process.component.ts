import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

import {
  BillService,
  BillResponse,
  ConfirmProcessRequest,
} from '../../services/bill.service';

type ProcessPage = 'home' | 'received' | 'existing';

interface VerificationRow {
  productId: number;
  category: string;
  productType: string;
  expectedQuantity: number;
  verifiedQuantity: number | null;
}

@Component({
  selector: 'app-process',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './process.component.html',
  styleUrl: './process.component.css',
})
export class ProcessComponent implements OnDestroy {
  // QR scanner properties.
  scanner: Html5Qrcode | null = null;
  scannerVisible = false;
  scannerStarting = false;
  scannerError = '';
  private isScannerStopping = false;

  // Controls which section is currently visible.
  currentPage: ProcessPage = 'home';

  billNumber = '';
  billId: number | null = null;

  bill: BillResponse | null = null;
  verificationRows: VerificationRow[] = [];

  loading = false;
  confirming = false;

  errorMessage = '';
  successMessage = '';

  // QR code information.
  qrCodeDataUrl = '';
  qrPayload = '';
  qrGenerating = false;

  // Success popup information.
  successPopupVisible = false;
  popupPreviousStatus = '';
  popupNewStatus = '';

  constructor(
    private billService: BillService,
    private cdr: ChangeDetectorRef,
  ) {}

  // Open the phone camera and start scanning QR codes.
  async startQrScanner(): Promise<void> {
    if (this.scannerStarting || this.scanner) {
      return;
    }

    this.scannerError = '';
    this.scannerVisible = true;
    this.scannerStarting = true;

    // Make Angular render the qr-reader element before scanner initialization.
    this.cdr.detectChanges();

    try {
      this.scanner = new Html5Qrcode('qr-reader');

      await this.scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 230, height: 230 },
          aspectRatio: 1,
        },
        (decodedText) => {
          this.handleScannedQr(decodedText);
        },
        () => {
          // Ignore normal scanning errors while looking for a QR code.
        },
      );

      this.scannerStarting = false;
    } catch (error) {
      console.error('Camera start failed:', error);

      this.scannerStarting = false;
      this.scannerError =
        'Unable to access camera. Please allow camera permission and try again.';

      this.scanner = null;
    }
  }

  // Extract Bill ID from the scanned QR code.
  async handleScannedQr(decodedText: string): Promise<void> {
    if (this.isScannerStopping) {
      return;
    }

    const prefix = 'DRYCLEAN-BILL:';

    if (!decodedText.startsWith(prefix)) {
      this.scannerError = 'Invalid QR code. Please scan a valid bill QR label.';
      return;
    }

    const scannedBillId = Number(decodedText.substring(prefix.length));

    if (!Number.isInteger(scannedBillId) || scannedBillId <= 0) {
      this.scannerError = 'Invalid Bill ID in QR code.';
      return;
    }

    this.isScannerStopping = true;

    try {
      // Stop camera before fetching the bill.
      await this.stopQrScanner();

      this.scannerVisible = false;
      this.scannerError = '';

      // Automatically populate Bill ID and fetch the bill.
      this.billId = scannedBillId;
      this.searchExistingBill();
    } catch (error) {
      console.error('Scanner stop failed:', error);

      this.scannerVisible = false;
      this.scannerError = 'Unable to stop the camera. Please try again.';
    } finally {
      this.isScannerStopping = false;
    }
  }

  // Stop the camera and release camera resources.
  async stopQrScanner(): Promise<void> {
    if (this.scanner) {
      const activeScanner = this.scanner;

      try {
        await activeScanner.stop();
        activeScanner.clear();
      } catch (error) {
        console.error('Error stopping QR scanner:', error);
      } finally {
        this.scanner = null;
      }
    }
  }

  // Close scanner without scanning a bill.
  async closeQrScanner(): Promise<void> {
    await this.stopQrScanner();

    this.scannerVisible = false;
    this.scannerStarting = false;
    this.scannerError = '';
  }

  // Release the camera when the component is destroyed.
  ngOnDestroy(): void {
    if (this.scanner) {
      this.scanner.stop().catch((error) => {
        console.error('Error releasing camera:', error);
      });
    }
  }

  // Open the received clothes verification section.
  openReceivedVerification(): void {
    this.currentPage = 'received';
    this.resetForm();
  }

  // Open the section for bills already in processing.
  openExistingProcess(): void {
    this.currentPage = 'existing';
    this.resetForm();
  }

  // Return to the main Process screen.
  goBack(): void {
    this.closeQrScanner();
    this.currentPage = 'home';
    this.resetForm();
  }

  // Fetch a bill using its physical bill number.
  searchBill(): void {
    const number = this.billNumber.trim();

    if (!number) {
      this.errorMessage = 'कृपया बिल नंबर दर्ज करें।';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.bill = null;
    this.verificationRows = [];

    this.billService.getBillByNumber(number).subscribe({
      next: (response) => {
        this.loading = false;

        // First-stage verification is only for received bills.
        if (response.processStatus !== 'RECEIVED') {
          this.errorMessage =
            'यह बिल प्राप्त स्थिति में नहीं है। वर्तमान स्थिति: ' +
            response.processStatus;
          return;
        }

        this.bill = response;
        this.prepareVerificationRows(response);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'बिल नहीं मिला। कृपया बिल नंबर जाँचें।';
      },
    });
  }

  // Fetch an existing bill using its database ID.
  searchExistingBill(): void {
    const id = Number(this.billId);

    if (this.billId === null || !Number.isInteger(id) || id <= 0) {
      this.errorMessage = 'कृपया सही Bill ID दर्ज करें।';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.bill = null;
    this.verificationRows = [];

    this.billService.getBillById(id).subscribe({
      next: (response) => {
        this.loading = false;

        // RECEIVED bills must go through initial verification.
        if (response.processStatus === 'RECEIVED') {
          this.errorMessage =
            'इस बिल की शुरुआती जाँच अभी नहीं हुई है। कृपया Verify Received Clothes का उपयोग करें।';
          return;
        }

        this.bill = response;

        if (response.processStatus === 'DELIVERED') {
          this.successMessage = 'यह बिल ग्राहक को पहले ही दिया जा चुका है।';
          return;
        }

        this.prepareVerificationRows(response);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message || 'बिल नहीं मिला। कृपया Bill ID जाँचें।';

        console.error('Bill search failed:', error);
      },
    });
  }

  // Prepare blank quantity fields for every product in the bill.
  private prepareVerificationRows(response: BillResponse): void {
    this.verificationRows = response.products.map((product) => ({
      productId: product.id,
      category: product.category,
      productType: product.productType,
      expectedQuantity: product.quantity,
      verifiedQuantity: null,
    }));
  }

  // Return the next status based on the current bill status.
  getNextProcessStatus(): string {
    if (!this.bill) {
      return '';
    }

    switch (this.bill.processStatus) {
      case 'UNDER_PROCESSING':
        return 'READY_FOR_SHOP';

      case 'READY_FOR_SHOP':
        return 'READY_FOR_DELIVERY';

      case 'READY_FOR_DELIVERY':
        return 'DELIVERED';

      default:
        return '';
    }
  }

  // Provide a readable name for the next stage.
  getNextProcessLabel(): string {
    const nextStatus = this.getNextProcessStatus();

    switch (nextStatus) {
      case 'READY_FOR_SHOP':
        return 'Ready for Shop';

      case 'READY_FOR_DELIVERY':
        return 'Ready for Delivery';

      case 'DELIVERED':
        return 'Delivered to Customer';

      default:
        return '';
    }
  }

  // Check that every product has a valid counted quantity.
  isVerificationValid(): boolean {
    return (
      this.verificationRows.length > 0 &&
      this.verificationRows.every(
        (row) =>
          row.verifiedQuantity !== null &&
          Number.isInteger(row.verifiedQuantity) &&
          row.verifiedQuantity >= 0,
      )
    );
  }

  // Submit the initial received clothes verification.
  confirmVerification(): void {
    if (!this.bill) {
      return;
    }

    if (!this.isVerificationValid()) {
      this.errorMessage = 'कृपया प्रत्येक कपड़े की गिनी हुई संख्या दर्ज करें।';
      return;
    }

    const request: ConfirmProcessRequest = {
      targetStatus: 'UNDER_PROCESSING',
      products: this.verificationRows.map((row) => ({
        productId: row.productId,
        verifiedQuantity: row.verifiedQuantity as number,
      })),
    };

    this.confirming = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.billService.confirmProcess(this.bill.billNumber, request).subscribe({
      next: async (response) => {
        this.confirming = false;
        this.bill = response;

        // Generate QR only after successful initial verification.
        await this.generateQrCode(response.id);

        // Show popup with QR printing option.
        this.openStatusPopup('RECEIVED', response.processStatus);
      },
      error: (error) => {
        this.confirming = false;
        this.errorMessage =
          error?.error?.message ||
          'जाँच की पुष्टि नहीं हो सकी। कृपया दोबारा प्रयास करें।';
      },
    });
  }

  // Confirm the next stage of an existing bill.
  confirmExistingProcess(): void {
    if (!this.bill) {
      return;
    }

    if (!this.isVerificationValid()) {
      this.errorMessage = 'कृपया प्रत्येक कपड़े की गिनी हुई संख्या दर्ज करें।';
      return;
    }

    const nextStatus = this.getNextProcessStatus();

    if (!nextStatus) {
      this.errorMessage = 'अगली प्रक्रिया उपलब्ध नहीं है।';
      return;
    }

    // Save the old status before updating it.
    const previousStatus = this.bill.processStatus;

    const request: ConfirmProcessRequest = {
      targetStatus: nextStatus,
      products: this.verificationRows.map((row) => ({
        productId: row.productId,
        verifiedQuantity: row.verifiedQuantity as number,
      })),
    };

    this.confirming = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.billService.confirmProcess(this.bill.billNumber, request).subscribe({
      next: (response) => {
        this.confirming = false;
        this.bill = response;
        this.verificationRows = [];

        if (response.processStatus !== 'DELIVERED') {
          this.prepareVerificationRows(response);
        }

        // Show the successful status transition.
        this.openStatusPopup(previousStatus, response.processStatus);
      },
      error: (error) => {
        this.confirming = false;
        this.errorMessage =
          error?.error?.message ||
          'प्रक्रिया अपडेट नहीं हो सकी। कृपया दोबारा प्रयास करें।';
      },
    });
  }

  // Convert process status into a Hindi name.
  getStatusHindi(status: string): string {
    const statusNames: { [key: string]: string } = {
      RECEIVED: 'कपड़े प्राप्त हुए',
      UNDER_PROCESSING: 'प्रक्रिया में',
      READY_FOR_SHOP: 'दुकान पर तैयार',
      READY_FOR_DELIVERY: 'डिलीवरी के लिए तैयार',
      DELIVERED: 'ग्राहक को सौंप दिए गए',
    };

    return statusNames[status] || status;
  }

  // Display the successful status update popup.
  openStatusPopup(previousStatus: string, newStatus: string): void {
    this.popupPreviousStatus = previousStatus;
    this.popupNewStatus = newStatus;
    this.successPopupVisible = true;
  }

  // Close popup and clear the current bill information.
  closeStatusPopup(): void {
    this.resetForm();
  }

  // Generate a QR code using the unique database bill ID.
  async generateQrCode(billId: number): Promise<void> {
    this.qrGenerating = true;
    this.qrCodeDataUrl = '';
    this.qrPayload = `DRYCLEAN-BILL:${billId}`;

    try {
      this.qrCodeDataUrl = await QRCode.toDataURL(this.qrPayload, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H',
      });
    } catch (error) {
      console.error('QR generation failed:', error);
      this.errorMessage = 'बिल की जाँच हो गई, लेकिन QR कोड नहीं बन पाया।';
    } finally {
      this.qrGenerating = false;
    }
  }

  // Print two identical QR labels.
  printQrLabels(): void {
    if (!this.qrCodeDataUrl || !this.bill) {
      this.errorMessage = 'QR कोड प्रिंटिंग के लिए तैयार नहीं है।';
      return;
    }

    const bill = this.bill;
    const printWindow = window.open('', '_blank', 'width=700,height=700');

    if (!printWindow) {
      this.errorMessage =
        'प्रिंटिंग विंडो नहीं खुल सकी। कृपया पॉप-अप की अनुमति दें।';
      return;
    }

    const label = `
      <div class="label">
        <h3>DRY CLEAN MANAGEMENT</h3>
        <img src="${this.qrCodeDataUrl}" alt="Bill QR Code">
        <h2>Bill ID: ${bill.id}</h2>
        <h2>Bill No: ${bill.billNumber}</h2>
        <h3>Customer: ${bill.customer?.name || 'N/A'}</h3>
        <p>Scan to continue processing</p>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bill QR Labels</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              margin: 20px;
            }

            .label {
              width: 280px;
              margin: 15px auto;
              padding: 12px;
              border: 1px dashed #333;
              page-break-inside: avoid;
            }

            img {
              width: 180px;
              height: 180px;
            }

            h3 {
              font-size: 15px;
              margin: 5px;
            }

            h2 {
              font-size: 18px;
              margin: 5px;
            }

            p {
              font-size: 11px;
              margin: 5px;
            }

            @media print {
              .label {
                break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          ${label}
          ${label}
        </body>
      </html>
    `);

    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  // Clear the current bill and verification data.
  private resetForm(): void {
    // Stop any open camera before clearing the form.
    this.closeQrScanner();

    this.billNumber = '';
    this.billId = null;
    this.bill = null;
    this.verificationRows = [];

    this.loading = false;
    this.confirming = false;

    this.errorMessage = '';
    this.successMessage = '';

    this.qrCodeDataUrl = '';
    this.qrPayload = '';
    this.qrGenerating = false;

    this.successPopupVisible = false;
    this.popupPreviousStatus = '';
    this.popupNewStatus = '';
  }
}
