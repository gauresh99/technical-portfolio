#include "drv1098x_faults.h"
#include "register_script.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

typedef struct {
    uint8_t reg[256];
    unsigned delays;
} fake_bus_t;

static i2c_status_t fake_write(void *ctx, uint8_t addr, uint8_t reg, uint8_t value)
{
    (void)addr;
    fake_bus_t *fake = (fake_bus_t *)ctx;
    fake->reg[reg] = value;
    return I2C_OK;
}

static i2c_status_t fake_read(void *ctx, uint8_t addr, uint8_t reg, uint8_t *value)
{
    (void)addr;
    fake_bus_t *fake = (fake_bus_t *)ctx;
    *value = fake->reg[reg];
    return I2C_OK;
}

static void fake_delay(unsigned ms)
{
    (void)ms;
}

static drv1098x_t make_driver(fake_bus_t *fake)
{
    i2c_bus_t bus = {
        .ctx = fake,
        .write_reg = fake_write,
        .read_reg = fake_read,
    };
    drv1098x_t dev;
    assert(drv1098x_init(&dev, bus, 0, 0) == DRV1098X_OK);
    return dev;
}

static void test_fault_descriptions(void)
{
    const drv1098x_fault_info_t *matches[4];
    size_t count = drv1098x_describe_faults(0x24, matches, 4);
    assert(count == 2);
    assert(matches[0]->code == DRV1098X_FAULT_LOCK2_ABNORMAL_KT);
    assert(matches[1]->code == DRV1098X_FAULT_LOCK5_CLOSED_LOOP_STUCK);
    assert(strstr(matches[0]->bringup_check, "BEMF") != 0);
}

static void test_register_script_success(void)
{
    fake_bus_t fake;
    memset(&fake, 0, sizeof(fake));
    drv1098x_t dev = make_driver(&fake);
    size_t count = 0;
    const register_op_t *ops = register_script_reverse_enable(&count);
    register_script_result_t result = register_script_run(&dev, ops, count, fake_delay);
    assert(result.ok);
    assert(result.completed == count);
    assert((fake.reg[DRV1098X_REG_SYS_OPT1] & DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE) != 0);
}

static void test_register_script_fault_blocks_sequence(void)
{
    fake_bus_t fake;
    memset(&fake, 0, sizeof(fake));
    fake.reg[DRV1098X_REG_STATUS] = DRV1098X_STATUS_OVER_CURRENT;
    drv1098x_t dev = make_driver(&fake);
    size_t count = 0;
    const register_op_t *ops = register_script_reverse_enable(&count);
    register_script_result_t result = register_script_run(&dev, ops, count, fake_delay);
    assert(!result.ok);
    assert(result.failed_index == 0);
    assert(fake.reg[DRV1098X_REG_SYS_OPT1] == 0x00);
}

int main(void)
{
    test_fault_descriptions();
    test_register_script_success();
    test_register_script_fault_blocks_sequence();
    puts("fault/register script tests passed");
    return 0;
}

