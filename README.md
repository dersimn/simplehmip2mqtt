This is a very simple approach building a homematic (rfd) to mqtt-smarthome bridge. This implementation dispenses completely with features like rega, homematic-ip and currently even collecting and building a paramsetDescription database (see [Homematic API](https://www.eq-3.de/Downloads/eq3/download%20bereich/hm_web_ui_doku/HM_XmlRpc_API.pdf) for details).

This way you will get the slimmest possible bridge, at the expense of a slightly more complex usability. You can dump your paramsetDescription for reference with my [hmGetInfo](https://github.com/dersimn/hmGetInfo) tool.

## Usage

	docker run -d --restart=always --name=hm \
		-p 2126:2126 \
		dersimn/simplehmrfd2mqtt \
		--ccu-address 10.1.1.112 \
		--init-address 10.1.1.50 \
		--mqtt-url mqtt://10.1.1.50 \
		--filter-blacklist "^PARTY_"
