const express = require('express');
const app = express();
const SquareConnect = require('square-connect');
const {
  TransactionsApi,
  OrdersApi,
  LocationsApi
} = require('square-connect');
const defaultClient = SquareConnect.ApiClient.instance;
const crypto = require('crypto');
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

let oauth2 = defaultClient.authentications['oauth2'];
oauth2.accessToken = process.env.ACCESS_TOKEN;

const transactionsApi = new TransactionsApi();
const ordersApi = new OrdersApi();
const locationsApi = new LocationsApi();


app.post('/chargeForCookie', async (request, response) => {
  const requestBody = request.body;
  const locations = await locationsApi.listLocations();
  const order = await ordersApi.createOrder(locations.locations[0].id, {
    idempotency_key: crypto.randomBytes(12).toString('hex'),
    merchant_id: locations.locations[0].merchant_id,
    line_items: [
      {
        name: "Cookie",
        quantity: "1",
        base_price_money: {
          amount: 100,
          currency: "USD"
        }
      }
    ]
  });
  try {
    const chargeBody = {
      "idempotency_key": crypto.randomBytes(12).toString('hex'),
      "card_nonce": requestBody.nonce,
      "amount_money": {
        "amount": order.order.total_money.amount,
        "currency": 'USD'
      },
      "order_id": order.order.id
    };
    const transaction = await transactionsApi.charge(locations.locations[0].id, chargeBody);
    console.log(transaction.transaction);

    response.status(200).json(transaction.transaction);
  } catch (e) {
    delete e.response.req.headers;
    delete e.response.req._headers;
    console.log(`[Error]:\nStatus:${e.status}\nMessages:${JSON.stringify((JSON.parse(e.response.text)).errors, null, 2)}`);

    const errorMessages = (JSON.parse(e.response.text)).errors;

    switch(errorMessages[0].code) {
        case "VERIFY_CVV_FAILURE":
          response.status(400).send({
              errorMessage: "Invalid CVV. Please re-enter card information."
          })
        case "VERIFY_AVS_FAILURE":
          response.status(400).send({
              errorMessage: "Invalid Postal Code. Please re-enter card information."
          })
        case "INVALID_EXPIRATION":
          response.status(400).send({
              errorMessage: "Card declined."
            })
        case "CARD_TOKEN_USED":
          response.status(400).send({
              errorMessage: "Card token already used; Please try re-entering card details."
          })
        default:
          response.status(400).send({
              errorMessage: "Payment error. Please contact support if issue persists."
          })
    }
  }
});

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log('Your app is listening on port ' + listener.address().port);
});
