CC ?= cc
CFLAGS ?= -std=c11 -Wall -Wextra -Wpedantic -Werror
BUILD := build

.PHONY: test-native clean

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/confidence_buffer_test: native/confidence_buffer.c native/confidence_buffer_test.c | $(BUILD)
	$(CC) $(CFLAGS) native/confidence_buffer.c native/confidence_buffer_test.c -o $@

test-native: $(BUILD)/confidence_buffer_test
	./$(BUILD)/confidence_buffer_test

clean:
	rm -rf $(BUILD)

