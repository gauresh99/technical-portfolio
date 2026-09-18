#ifndef CONFIDENCE_BUFFER_H
#define CONFIDENCE_BUFFER_H

#include <stddef.h>

typedef struct {
    float *values;
    size_t capacity;
    size_t count;
    size_t head;
} confidence_buffer_t;

void confidence_buffer_init(confidence_buffer_t *buffer, float *storage, size_t capacity);
void confidence_buffer_push(confidence_buffer_t *buffer, float value);
float confidence_buffer_mean(const confidence_buffer_t *buffer);
float confidence_buffer_latest(const confidence_buffer_t *buffer);

#endif

