package com.sakha.control

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import java.io.Closeable
import java.util.UUID

class BluetoothCommandLink(
    private val adapter: BluetoothAdapter,
    private val deviceAddress: String
) : Closeable {
    private var socket: BluetoothSocket? = null

    fun connect() {
        val device: BluetoothDevice = adapter.getRemoteDevice(deviceAddress)
        socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        socket?.connect()
    }

    fun sendMove(direction: String, speed: Int = 160) {
        val cleanDirection = direction.uppercase()
        val cleanSpeed = speed.coerceIn(0, 255)
        val payload = if (cleanDirection == "STOP") {
            "STOP\n"
        } else {
            "MOVE $cleanDirection $cleanSpeed\n"
        }
        socket?.outputStream?.write(payload.toByteArray(Charsets.US_ASCII))
    }

    override fun close() {
        socket?.close()
        socket = null
    }

    companion object {
        private val SPP_UUID: UUID =
            UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }
}

