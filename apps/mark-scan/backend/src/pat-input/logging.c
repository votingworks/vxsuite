#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <errno.h>

#include "logging.h"

void print_log_common(char *event_id, char *event_type, char *message, char *operation, char *disposition)
{
  printf(
      "{\"eventId\": \"%s\", \"source\": \"vx-mark-scan-pat-input-daemon\", \"eventType\": \"%s\", \"user\": \"system\", \"message\": \"%s\", \"operation\": \"%s\", \"disposition\": \"%s\"}\n",
      event_id,
      event_type,
      message,
      operation,
      disposition);
}

char *success = "success";
char *failure = "failure";
char *na = "n/a";

char *disposition_enum_to_str(int disposition)
{
  if (disposition == SUCCESS)
  {
    return success;
  }
  else if (disposition == FAILURE)
  {
    return failure;
  }
  return na;
}

char *action = "action";
char *status = "status";
char *event_type_enum_to_str(int event_type)
{
  if (event_type == ACTION)
  {
    return action;
  }
  return status;
}

void print_log(char *event_id, int event_type, char *message, char *operation, int disposition)
{
  print_log_common(event_id, event_type_enum_to_str(event_type), message, operation, disposition_enum_to_str(disposition));
}

// Convenience function for logging an action with less information
void log_action(char *event_id, int disposition)
{
  print_log_common(event_id, "system-action", "", "", disposition_enum_to_str(disposition));
}

// Similar to perror, logs an error log where `message` is the latest runtime error.
void log_error(char *event_id)
{
  print_log_common(event_id, "system-status", strerror(errno), "", "failure");
}
