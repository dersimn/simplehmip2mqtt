This is a very simple approach to build a Homematic IP to mqtt-smarthome bridge.

## Usage

	docker run -d --restart=always --name=hm \
		-p 3126:3126 \
		dersimn/simplehmip2mqtt \
		--ccu-address 10.1.1.112 \
		--init-address 10.1.1.50 \
		--mqtt-url mqtt://10.1.1.50 \
		--filter-blacklist "^PARTY_"
