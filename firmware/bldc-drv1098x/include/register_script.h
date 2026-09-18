#ifndef REGISTER_SCRIPT_H
#define REGISTER_SCRIPT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "drv1098x.h"

typedef enum {
    REG_OP_WRITE,
    REG_OP_READ_EXPECT,
    REG_OP_DELAY_MS
} register_op_kind_t;

typedef struct {
    register_op_kind_t kind;
    uint8_t reg;
    uint8_t value;
    uint8_t mask;
    unsigned delay_ms;
    const char *note;
} register_op_t;

typedef struct {
    size_t completed;
    size_t failed_index;
    uint8_t observed;
    bool ok;
} register_script_result_t;

register_script_result_t register_script_run(drv1098x_t *dev,
                                             const register_op_t *ops,
                                             size_t count,
                                             void (*delay_ms)(unsigned));

const register_op_t *register_script_reverse_enable(size_t *count);

#endif

