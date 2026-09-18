#include "drv1098x.h"

#include <assert.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef struct {
    uint8_t reg[256];
    uint8_t writes_reg[16];
    uint8_t writes_value[16];
    int write_count;
    drv1098x_direction_t direction;
} fake_bus_t;

static i2c_status_t fake_write(void *ctx, uint8_t addr, uint8_t reg, uint8_t value)
{
    assert(addr == DRV1098X_I2C_ADDR_7BIT);
    fake_bus_t *fake = (fake_bus_t *)ctx;
    fake->reg[reg] = value;
    fake->writes_reg[fake->write_count] = reg;
    fake->writes_value[fake->write_count] = value;
    fake->write_count++;
    return I2C_OK;
}

static i2c_status_t fake_read(void *ctx, uint8_t addr, uint8_t reg, uint8_t *value)
{
    assert(addr == DRV1098X_I2C_ADDR_7BIT);
    fake_bus_t *fake = (fake_bus_t *)ctx;
    *value = fake->reg[reg];
    return I2C_OK;
}

static void fake_dir(void *ctx, drv1098x_direction_t dir)
{
    fake_bus_t *fake = (fake_bus_t *)ctx;
    fake->direction = dir;
}

static drv1098x_t make_driver(fake_bus_t *fake)
{
    i2c_bus_t bus = {
        .ctx = fake,
        .write_reg = fake_write,
        .read_reg = fake_read,
    };
    drv1098x_t dev;
    assert(drv1098x_init(&dev, bus, fake_dir, fake) == DRV1098X_OK);
    return dev;
}

static void test_speed_write_order(void)
{
    fake_bus_t fake;
    memset(&fake, 0, sizeof(fake));
    drv1098x_t dev = make_driver(&fake);

    assert(drv1098x_set_speed_raw(&dev, 0x0155u) == DRV1098X_OK);
    assert(fake.write_count == 2);
    assert(fake.writes_reg[0] == DRV1098X_REG_SPEED_CTRL2);
    assert(fake.writes_value[0] == (DRV1098X_SPEED_CTRL2_OVERRIDE | 0x01u));
    assert(fake.writes_reg[1] == DRV1098X_REG_SPEED_CTRL1);
    assert(fake.writes_value[1] == 0x55u);
}

static void test_conversions(void)
{
    assert(drv1098x_speed_percent_to_raw(0) == 0);
    assert(drv1098x_speed_percent_to_raw(100) == 511);
    assert(fabs(drv1098x_speed_raw_to_percent(256) - 50.0978) < 0.01);
    assert(fabs(drv1098x_decode_speed_hz(0x01, 0xFF) - 51.1) < 0.001);
    assert(fabs(drv1098x_decode_supply_voltage(102) - 11.9531) < 0.001);
    assert(fabs(drv1098x_decode_motor_current(0x04, 0x3C) - 0.3574) < 0.001);
}

static void test_direction_and_reverse_drive(void)
{
    fake_bus_t fake;
    memset(&fake, 0, sizeof(fake));
    fake.reg[DRV1098X_REG_SYS_OPT1] = 0x00;
    drv1098x_t dev = make_driver(&fake);

    assert(drv1098x_set_direction(&dev, DRV1098X_DIR_REVERSE) == DRV1098X_OK);
    assert(fake.direction == DRV1098X_DIR_REVERSE);
    assert(drv1098x_enable_reverse_drive(&dev, true) == DRV1098X_OK);
    assert((fake.reg[DRV1098X_REG_SYS_OPT1] & DRV1098X_SYS_OPT1_REVERSE_DRIVE_ENABLE) != 0);
}

int main(void)
{
    test_speed_write_order();
    test_conversions();
    test_direction_and_reverse_drive();
    puts("drv1098x tests passed");
    return 0;
}

