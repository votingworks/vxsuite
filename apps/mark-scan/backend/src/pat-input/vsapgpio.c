#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>

#include "logging.h"

const int MAX_PIN_NUMBER_DIGITS = 3;
const int MAX_LOG_MESSAGE_SIZE = 512;

int ascii_to_int(int ascii_char)
{
  return ascii_char - '0';
}

int get_fd(char *filepath, char *operation_name, int permission)
{
  char log_message[MAX_LOG_MESSAGE_SIZE];
  if (512 - strlen(filepath) >= 0)
  {
    sprintf(log_message, "Failed to open file descriptor for %s", filepath);
  }

  int fd = open(filepath, permission);
  if (fd == -1)
  {
    print_log("sysfs-open-fd", "system-action", log_message, operation_name, FAILURE);
    exit(1);
  }
  // get_fd is called from a loop, so only log on failure to reduce spam
  return fd;
}

void write_to_sysfs_pin_file(int fd, char *pin, char *operation_name)
{
  char log_message[16];
  sprintf(log_message, "pin #%s", pin);
  int bytes_written = write(fd, pin, MAX_PIN_NUMBER_DIGITS);
  if (bytes_written != MAX_PIN_NUMBER_DIGITS)
  {
    print_log("syfs-write-file", "system-action", log_message, "export-pin", FAILURE);
    exit(1);
  }
  print_log("syfs-write-file", "system-action", log_message, "export-pin", SUCCESS);
}

void unexport_pin(char *pin)
{
  char log_message[10];
  sprintf(log_message, "pin #%s", pin);
  // Unexport the pin by writing to /sys/class/gpio/unexport
  print_log("gpio-pin-operation-init", "system-action", log_message, "unexport-pin", NA);
  int fd = get_fd("/sys/class/gpio/unexport", "unexport-pin", O_WRONLY);
  write_to_sysfs_pin_file(fd, pin, "unexport-pin");
  close(fd);
  print_log("gpio-pin-operation-complete", "system-action", log_message, "unexport-pin", SUCCESS);
}

void export_pin(char *pin)
{
  // Export the desired pin by writing to /sys/class/gpio/export
  char log_message[16];
  sprintf(log_message, "pin #%s", pin);
  print_log("gpio-pin-operation-init", "system-action", log_message, "export-pin", NA);
  int fd = get_fd("/sys/class/gpio/export", "export-pin", O_WRONLY);
  write_to_sysfs_pin_file(fd, pin, "export-pin");
  close(fd);
  print_log("gpio-pin-operation-complete", "system-action", log_message, "export-pin", SUCCESS);
}

void set_pin_direction_in(char *pin)
{
  char log_message[16];
  sprintf(log_message, "pin #%s", pin);
  print_log("gpio-pin-operation-init", "system-action", log_message, "set-direction", NA);
  char path[strlen("/sys/class/gpio/gpio/direction") + MAX_PIN_NUMBER_DIGITS];
  sprintf(path, "/sys/class/gpio/gpio%s/direction", pin);
  int fd = get_fd(path, "set-direction", O_WRONLY);
  if (write(fd, "in", 2) != 2)
  {
    exit(1);
  }
  close(fd);
  print_log("gpio-pin-operation-complete", "system-action", log_message, "set-direction", SUCCESS);
}

// Gets a file descriptor for a pin's value file at /sys/class/gpio/gpio<pin_number>/value
int get_pin_value_fd(char *pin)
{
  char value_path[strlen("/sys/class/gpio/gpio/value") + MAX_PIN_NUMBER_DIGITS];
  sprintf(value_path,
          "/sys/class/gpio/gpio%s/value",
          pin);
  int fd = get_fd(value_path, "get-pin-value", O_RDONLY);
  return fd;
}

// Reads and return the value of a GPIO pin given a file descriptor
// from get_pin_value_fd. Assumes the pin has already been exported.
int read_pin_value_from_fd(int fd)
{
  // Pin value should be exactly 1 ASCII char == 1 byte
  char pin_value_ascii;
  read(fd, &pin_value_ascii, 1);

  return ascii_to_int(pin_value_ascii);
}

// Convenience function that returns value of a pin that follows typical boolean conventions.
// The pin that is read is specified by the given file descriptor.
bool get_bool_pin_value(int fd)
{
  // 1 is the default state, 0 is actioned state
  // connection status: 1 when PAT device is not plugged in, 0 when plugged in
  // A/B signal: 1 when no signal is sent from device, 0 when signal is sent
  int value = read_pin_value_from_fd(fd);

  if (value == 0)
  {
    return true;
  }

  return false;
}
