CC ?= cc
CFLAGS ?= -std=c11 -Wall -Wextra -Wpedantic -Werror -Iinclude
BUILD := build

DRIVER_SRC := src/drv1098x.c src/drv1098x_faults.c src/register_script.c src/motor_profile.c

.PHONY: all test clean

all: $(BUILD)/bldc_demo

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/bldc_demo: $(DRIVER_SRC) src/main.c | $(BUILD)
	$(CC) $(CFLAGS) $(DRIVER_SRC) src/main.c -o $@

$(BUILD)/test_drv1098x: $(DRIVER_SRC) tests/test_drv1098x.c | $(BUILD)
	$(CC) $(CFLAGS) $(DRIVER_SRC) tests/test_drv1098x.c -o $@

$(BUILD)/test_faults: $(DRIVER_SRC) tests/test_faults.c | $(BUILD)
	$(CC) $(CFLAGS) $(DRIVER_SRC) tests/test_faults.c -o $@

test: $(BUILD)/test_drv1098x $(BUILD)/test_faults
	./$(BUILD)/test_drv1098x
	./$(BUILD)/test_faults

clean:
	rm -rf $(BUILD)
