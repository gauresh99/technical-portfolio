.PHONY: test test-bldc test-sakha test-interview test-personal clean

test: test-bldc test-sakha test-interview test-personal

test-bldc:
	$(MAKE) -C firmware/bldc-drv1098x test

test-sakha:
	cd firmware/sakha-wheelchair/gateway && python3 -m unittest discover tests

test-interview:
	cd ml/ai-mock-interview && python3 -m unittest discover tests
	$(MAKE) -C ml/ai-mock-interview test-native

test-personal:
	cd apps/personal-style-bot && node test/engine.test.js

clean:
	$(MAKE) -C firmware/bldc-drv1098x clean
	$(MAKE) -C ml/ai-mock-interview clean

