enum Disposition
{
  SUCCESS,
  FAILURE,
  NA
};

void print_log(char *event_id, char *event_type, char *message, char *operation, int disposition);
void log_action(char *event_id, int disposition);
void log_error(char *event_id);
