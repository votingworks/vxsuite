#include <fcntl.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <sys/stat.h>
#include <time.h>
#include <signal.h>
#include <stdbool.h>
#include <unistd.h>
#include <string.h>

#include "vsapgpio.h"

bool should_exit_cleanly = false;
char *pat_is_connected_gpio_number = "478";
char *pat_a_signal_gpio_number = "481";
char *pat_b_signal_gpio_number = "476";

const long INTERVAL_MS = 100;
struct timespec interval_timespec = {
    0,
    (INTERVAL_MS % 1000) * 1000000,
};
struct timespec rem;

void emit(int fd, int type, int code, int val)
{
  struct input_event ie;

  ie.type = type;
  ie.code = code;
  ie.value = val;
  /* timestamp values below are ignored */
  ie.time.tv_sec = 0;
  ie.time.tv_usec = 0;

  write(fd, &ie, sizeof(ie));
}

void interrupt(int signal)
{
  // TODO handle error signals
  printf("Got signal %d\n", signal);
  should_exit_cleanly = true;
}

int main(void)
{
  struct uinput_setup usetup;

  int uinput_fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);

  /*
   * The ioctls below will enable the device that is about to be
   * created, to pass key events.
   */
  ioctl(uinput_fd, UI_SET_EVBIT, EV_KEY);
  ioctl(uinput_fd, UI_SET_KEYBIT, KEY_1);
  ioctl(uinput_fd, UI_SET_KEYBIT, KEY_2);

  memset(&usetup, 0, sizeof(usetup));
  usetup.id.bustype = BUS_USB;
  usetup.id.vendor = 0x1234;  /* sample vendor */
  usetup.id.product = 0x5678; /* sample product */
  strcpy(usetup.name, "PAT Input daemon virtual device");

  ioctl(uinput_fd, UI_DEV_SETUP, &usetup);
  ioctl(uinput_fd, UI_DEV_CREATE);

  /*
   * On UI_DEV_CREATE the kernel will create the device node for this
   * device. We are inserting a pause here so that userspace has time
   * to detect, initialize the new device, and can start listening to
   * the event, otherwise it will not notice the event we are about
   * to send. This pause is only needed in our example code!
   */
  sleep(1);

  // TODO handle already-exported pins
  export_pin(pat_is_connected_gpio_number);
  export_pin(pat_a_signal_gpio_number);
  export_pin(pat_b_signal_gpio_number);

  set_pin_direction_in(pat_is_connected_gpio_number);
  set_pin_direction_in(pat_a_signal_gpio_number);
  set_pin_direction_in(pat_b_signal_gpio_number);

  int is_connected_value_fd = get_pin_value_fd(pat_is_connected_gpio_number);
  bool is_connected = get_bool_pin_value(is_connected_value_fd);

  printf("Initial PAT device is connected: %s\n", is_connected ? "true" : "false");

  int a_signal_fd = get_pin_value_fd(pat_a_signal_gpio_number);
  bool a_signal = get_bool_pin_value(a_signal_fd);
  printf("Initial A value: %s\n", a_signal ? "true" : "false");

  int b_signal_fd = get_pin_value_fd(pat_b_signal_gpio_number);
  bool b_signal = get_bool_pin_value(b_signal_fd);
  printf("Initial B value: %s\n", b_signal ? "true" : "false");

  signal(SIGINT, interrupt);

  while (!should_exit_cleanly)
  {
    // Need to get file descriptor each time we read or the value will be stale
    a_signal_fd = get_pin_value_fd(pat_a_signal_gpio_number);
    bool new_a_signal = get_bool_pin_value(a_signal_fd);

    b_signal_fd = get_pin_value_fd(pat_b_signal_gpio_number);
    bool new_b_signal = get_bool_pin_value(b_signal_fd);

    // Only emit keyboard event when signal changes
    if (new_a_signal && !a_signal)
    {
      printf("'A' signal triggered\n");
      /* Key press, report the event, send key release, and report again */
      emit(uinput_fd, EV_KEY, KEY_1, 1);
      emit(uinput_fd, EV_SYN, SYN_REPORT, 0);
      emit(uinput_fd, EV_KEY, KEY_1, 0);
      emit(uinput_fd, EV_SYN, SYN_REPORT, 0);
    }

    if (new_b_signal && !b_signal)
    {
      printf("'B' signal triggered\n");
      /* Key press, report the event, send key release, and report again */
      emit(uinput_fd, EV_KEY, KEY_2, 1);
      emit(uinput_fd, EV_SYN, SYN_REPORT, 0);
      emit(uinput_fd, EV_KEY, KEY_2, 0);
      emit(uinput_fd, EV_SYN, SYN_REPORT, 0);
    }

    a_signal = new_a_signal;
    b_signal = new_b_signal;
    int close_result = close(a_signal_fd);
    if (close_result != 0)
    {
      perror("Failed to close A signal file descriptor\n");
    }
    close_result = close(b_signal_fd);
    if (close_result != 0)
    {
      perror("Failed to close B signal file descriptor\n");
    }
    // Sleep accepts integer seconds only and we want to poll more frequently
    nanosleep(&interval_timespec, &rem);
  }

  printf("Unexporting pins\n");
  unexport_pin(pat_is_connected_gpio_number);
  unexport_pin(pat_a_signal_gpio_number);
  unexport_pin(pat_b_signal_gpio_number);

  printf("Closing GPIO sysfs file descriptors\n");
  close(a_signal);
  close(b_signal);
  close(is_connected_value_fd);

  /*
   * Events are unlikely to have been sent recently, but we still
   * give userspace some time to read the events before we clean up by
   * closing GPIO connections and destroying the virtual device with
   * UI_DEV_DESTOY.
   */
  sleep(1);

  printf("Cleaning up virtual device\n");
  ioctl(uinput_fd, UI_DEV_DESTROY);
  close(uinput_fd);

  return 0;
}
