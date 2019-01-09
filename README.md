This is a very simple approach to build a Homematic IP to mqtt-smarthome bridge.  
I've tested this script only with an HmIP-MOD-OC8 module. There might be some issue for other devices, especially with integer/float values (see [here](https://github.com/dersimn/simplehmip2mqtt/blob/25cb21df7e84a883674034a0d9c92d525da92398/index.js#L178)).

## Usage

	docker run -d --restart=always --name=hmip \
		-p 3126:3126 \
		dersimn/simplehmip2mqtt \
		--ccu-address 10.1.1.112 \
		--init-address 10.1.1.50 \
		--mqtt-url mqtt://10.1.1.50 \
		--filter-blacklist "^PARTY_"
