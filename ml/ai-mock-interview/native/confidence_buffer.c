#include "confidence_buffer.h"

void confidence_buffer_init(confidence_buffer_t *buffer, float *storage, size_t capacity)
{
    buffer->values = storage;
    buffer->capacity = capacity;
    buffer->count = 0;
    buffer->head = 0;
}

void confidence_buffer_push(confidence_buffer_t *buffer, float value)
{
    if (!buffer || !buffer->values || buffer->capacity == 0) {
        return;
    }
    if (value < 0.0f) {
        value = 0.0f;
    }
    if (value > 1.0f) {
        value = 1.0f;
    }

    buffer->values[buffer->head] = value;
    buffer->head = (buffer->head + 1u) % buffer->capacity;
    if (buffer->count < buffer->capacity) {
        buffer->count++;
    }
}

float confidence_buffer_mean(const confidence_buffer_t *buffer)
{
    if (!buffer || !buffer->values || buffer->count == 0) {
        return 0.0f;
    }

    float total = 0.0f;
    for (size_t i = 0; i < buffer->count; ++i) {
        total += buffer->values[i];
    }
    return total / (float)buffer->count;
}

float confidence_buffer_latest(const confidence_buffer_t *buffer)
{
    if (!buffer || !buffer->values || buffer->count == 0) {
        return 0.0f;
    }

    size_t idx = buffer->head == 0 ? buffer->capacity - 1u : buffer->head - 1u;
    return buffer->values[idx];
}

