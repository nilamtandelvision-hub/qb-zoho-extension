const { syncSingleCustomer } = require("./sync");

async function handleWebhook(req, res) {

    const events = req.body.eventNotifications;

    if (!events) {
        return res.status(200).send("No events");
    }

    const accessToken = global.qbTokens?.access_token;
    const realmId = global.qbRealmId;
    const zohoToken = global.zohoTokens?.access_token;

    for (const event of events) {

        const entities = event.dataChangeEvent.entities;

        for (const entity of entities) {

            if (entity.name === "Customer" && entity.operation === "Create") {

                const customerId = entity.id;

                await syncSingleCustomer(accessToken, realmId, zohoToken, customerId);

            }

        }
    }

    res.status(200).send("Webhook processed");

}

module.exports = { handleWebhook };