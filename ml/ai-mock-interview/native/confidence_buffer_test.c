#include "confidence_buffer.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

int main(void)
{
    float storage[3] = {0};
    confidence_buffer_t buffer;
    confidence_buffer_init(&buffer, storage, 3);

    confidence_buffer_push(&buffer, 0.2f);
    confidence_buffer_push(&buffer, 0.6f);
    confidence_buffer_push(&buffer, 1.5f);
    assert(fabsf(confidence_buffer_latest(&buffer) - 1.0f) < 0.001f);
    assert(fabsf(confidence_buffer_mean(&buffer) - 0.6f) < 0.001f);

    confidence_buffer_push(&buffer, 0.4f);
    assert(fabsf(confidence_buffer_latest(&buffer) - 0.4f) < 0.001f);
    assert(fabsf(confidence_buffer_mean(&buffer) - (0.4f + 0.6f + 1.0f) / 3.0f) < 0.001f);

    puts("confidence buffer tests passed");
    return 0;
}

