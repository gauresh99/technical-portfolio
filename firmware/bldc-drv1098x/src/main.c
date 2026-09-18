#include "drv1098x.h"
#include "motor_profile.h"

#include <stdio.h>
#include <string.h>

typedef struct {
    uint8_t reg[256];
    drv1098x_direction_t direction;
} mock_board_t;

static i2c_status_t mock_write(void *ctx, uint8_t addr, uint8_t reg, uint8_t value)
{
    (void)addr;
    mock_board_t *board = (mock_board_t *)ctx;
    board->reg[reg] = value;
    return I2C_OK;
}

static i2c_status_t mock_read(void *ctx, uint8_t addr, uint8_t reg, uint8_t *value)
{
    (void)addr;
    mock_board_t *board = (mock_board_t *)ctx;
    *value = board->reg[reg];
    return I2C_OK;
}

static void mock_dir(void *ctx, drv1098x_direction_t dir)
{
    mock_board_t *board = (mock_board_t *)ctx;
    board->direction = dir;
}

int main(void)
{
    mock_board_t board;
    memset(&board, 0, sizeof(board));

    i2c_bus_t bus = {
        .ctx = &board,
        .write_reg = mock_write,
        .read_reg = mock_read,
    };

    drv1098x_t fan;
    if (drv1098x_init(&fan, bus, mock_dir, &board) != DRV1098X_OK) {
        return 1;
    }

    const motor_profile_t *profile = motor_profile_default();
    const exhaust_speed_point_t *point = motor_profile_find(profile, "medium-exhaust");
    if (!point) {
        return 1;
    }

    drv1098x_set_direction(&fan, DRV1098X_DIR_REVERSE);
    drv1098x_enable_reverse_drive(&fan, true);
    drv1098x_set_speed_raw(&fan, drv1098x_speed_percent_to_raw(point->speed_percent));

    printf("profile=%s mode=%s direction=%s speed=%u%% raw=0x%02X%02X\n",
           profile->motor_name,
           point->name,
           board.direction == DRV1098X_DIR_REVERSE ? "reverse" : "forward",
           point->speed_percent,
           board.reg[DRV1098X_REG_SPEED_CTRL2] & 0x01u,
           board.reg[DRV1098X_REG_SPEED_CTRL1]);
    return 0;
}

