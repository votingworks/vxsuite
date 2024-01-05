#include <libusb-1.0/libusb.h>
#include <stdio.h>
#include <stdlib.h>

#define VENDOR_ID 0x0bd7
#define PRODUCT_ID 0xa002
#define ENDPOINT_OUT 0x05
#define ENDPOINT_IN 0x85
#define ENDPOINT_IN_ALT 0x86

libusb_context *ctx = NULL;
libusb_device_handle *dev_handle = NULL;
struct libusb_transfer *transfer = NULL;
struct libusb_transfer *transfer_alt = NULL;
unsigned char buffer[64];
unsigned char buffer_alt[64];

void callback(struct libusb_transfer *transfer)
{
    if (transfer->status == LIBUSB_TRANSFER_COMPLETED)
    {
        if (transfer->endpoint == ENDPOINT_OUT)
        {
            printf("Data sent successfully\n");
        }
        else if (transfer->endpoint == ENDPOINT_IN)
        {
            // Handle the received data
            printf("Received data: ");
            for (int i = 0; i < transfer->actual_length; i++)
            {
                printf("%02X ", buffer[i]);
            }
            printf("\n");
        }
        else
        {
            fprintf(stderr, "Invalid endpoint\n");
        }

        libusb_fill_bulk_transfer(transfer, dev_handle, ENDPOINT_IN, buffer, sizeof(buffer), callback, NULL, 0);
        libusb_submit_transfer(transfer);
    }
    else if (transfer->status == LIBUSB_TRANSFER_CANCELLED)
    {
        // Cleanup and exit
        libusb_free_transfer(transfer);
        libusb_close(dev_handle);
        libusb_exit(ctx);
        exit(0);
    }
    else
    {
        // Handle errors
        fprintf(stderr, "Transfer error: %s\n", libusb_error_name(transfer->status));
    }
}

void callback_alt(struct libusb_transfer *transfer)
{
    if (transfer->status == LIBUSB_TRANSFER_COMPLETED)
    {
        printf("Received ALT data: ");
        for (int i = 0; i < transfer->actual_length; i++)
        {
            printf("%02X ", buffer_alt[i]);
        }
        printf("\n");
    }

    libusb_submit_transfer(transfer);
}

void run_event_loop()
{
    int r;
    while (1)
    {
        r = libusb_handle_events(ctx);
        if (r < 0)
        {
            fprintf(stderr, "libusb_handle_events error: %s\n", libusb_error_name(r));
            break;
        }
    }
}

int main()
{
    int r;

    // Initialize libusb
    r = libusb_init(&ctx);
    if (r < 0)
    {
        fprintf(stderr, "libusb_init error: %s\n", libusb_error_name(r));
        return r;
    }

    struct libusb_device **devs;

    if (libusb_get_device_list(ctx, &devs) < 0)
    {
        fprintf(stderr, "Failed to get device list\n");
        libusb_exit(ctx);
        return -1;
    }

    struct libusb_device *found = NULL;
    struct libusb_device *dev;

    size_t i = 0;
    while ((dev = devs[i++]) != NULL)
    {
        struct libusb_device_descriptor desc;
        if (libusb_get_device_descriptor(dev, &desc) < 0)
        {
            fprintf(stderr, "Failed to get device descriptor\n");
            libusb_free_device_list(devs, 1);
            libusb_exit(ctx);
            return -1;
        }

        printf("Device: %04X:%04X\n", desc.idVendor, desc.idProduct);

        if (desc.idVendor == VENDOR_ID && desc.idProduct == PRODUCT_ID)
        {
            found = dev;
            break;
        }
    }

    libusb_free_device_list(devs, 1);

    if (!found)
    {
        fprintf(stderr, "Device not found\n");
        libusb_exit(ctx);
        return -1;
    }

    r = libusb_open(found, &dev_handle);
    if (r < 0)
    {
        fprintf(stderr, "libusb_open error: %s\n", libusb_error_name(r));
        libusb_exit(ctx);
        return r;
    }

    // send 0x02, b'D', 0x03, 0xb4
    // int status = libusb_bulk_transfer(dev_handle, ENDPOINT_OUT, "\x02\x44\x03\xb4", 4, NULL, 0);
    transfer = libusb_alloc_transfer(0);
    libusb_fill_bulk_transfer(transfer, dev_handle, ENDPOINT_OUT, "\x02\x44\x03\xb4", 4, callback, NULL, 0);

    printf("Sending data...\n");
    printf("transfer.dev_handle: %p\n", transfer->dev_handle);
    printf("transfer.flags: %d\n", transfer->flags);
    printf("transfer.endpoint: %d\n", transfer->endpoint);
    printf("transfer.type: %d\n", transfer->type);
    printf("transfer.timeout: %d\n", transfer->timeout);
    printf("transfer.buffer: %p\n", transfer->buffer);
    printf("transfer.length: %d\n", transfer->length);
    printf("transfer.actual_length: %d\n", transfer->actual_length);
    printf("transfer.user_data: %p\n", transfer->user_data);
    printf("transfer.callback: %p\n", transfer->callback);
    printf("transfer.num_iso_packets: %d\n", transfer->num_iso_packets);
    printf("transfer.iso_packet_desc: %p\n", transfer->iso_packet_desc);

    // Submit the transfer for the first time
    libusb_submit_transfer(transfer);

    // transfer_alt = libusb_alloc_transfer(0);
    // libusb_fill_bulk_transfer(transfer_alt, dev_handle, ENDPOINT_IN_ALT, buffer_alt, sizeof(buffer_alt), callback_alt, NULL, 0);

    // Submit the transfer for the first time
    // libusb_submit_transfer(transfer_alt);

    // Run the event loop in a thread
    run_event_loop();

    return 0;
}
