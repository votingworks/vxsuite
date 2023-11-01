#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

const int MAX_PIN_NUMBER_DIGITS = 3;

int ascii_to_int(int ascii_char)
{
  return ascii_char - '0';
}

void unexport_pin(char *pin)
{
  // Unexport the pin by writing to /sys/class/gpio/unexport
  int fd = open("/sys/class/gpio/unexport", O_WRONLY);
  if (fd == -1)
  {
    perror("Unable to open /sys/class/gpio/unexport");
    exit(1);
  }

  if (write(fd, pin, MAX_PIN_NUMBER_DIGITS) != MAX_PIN_NUMBER_DIGITS)
  {
    perror("Error writing to /sys/class/gpio/unexport");
    exit(1);
  }

  close(fd);
}

void export_pin(char *pin)
{
  // Export the desired pin by writing to /sys/class/gpio/export
  int fd = open("/sys/class/gpio/export", O_WRONLY);
  if (fd == -1)
  {
    perror("Unable to open /sys/class/gpio/export");
    exit(1);
  }

  if (write(fd, pin, MAX_PIN_NUMBER_DIGITS) != MAX_PIN_NUMBER_DIGITS)
  {
    perror("Error writing to /sys/class/gpio/export");
    exit(1);
  }

  close(fd);
}

void set_pin_direction_in(char *pin)
{
  char path[strlen("/sys/class/gpio/gpio/direction") + MAX_PIN_NUMBER_DIGITS];
  sprintf(path, "/sys/class/gpio/gpio%s/direction", pin);
  printf("Attempting to open fd to path: %s\n", path);
  int fd = open(path, O_WRONLY);
  if (fd == -1)
  {
    perror("Unable to open pin direction fd");
    exit(1);
  }

  if (write(fd, "in", 3) != 3)
  {
    perror("Error writing to pin direction file");
    exit(1);
  }

  close(fd);
}

// Gets a file descriptor for a pin's value file at /sys/class/gpio/gpio<pin_number>/value
int get_pin_value_fd(char *pin)
{
  char value_path[strlen("/sys/class/gpio/gpio/value") + MAX_PIN_NUMBER_DIGITS];
  sprintf(value_path,
          "/sys/class/gpio/gpio%s/value",
          pin);
  int fd = open(value_path, O_RDONLY);
  if (fd == -1)
  {
    perror("Unable to open value pin");
    exit(1);
  }

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
