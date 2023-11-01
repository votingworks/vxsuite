int ascii_to_int(int ascii_char);
void unexport_pin(char *pin);
void export_pin(char *pin);
void set_pin_direction_in(char *pin);
int get_pin_value_fd(char *pin);
int read_pin_value_from_fd(int fd);
bool get_bool_pin_value(int fd);
