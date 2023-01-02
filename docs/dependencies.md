# Content Server dependencies
```mermaid
graph LR

contentserver[Content Server] --> catalystapispecs[catalyst-api-specs]
contentserver --> catalystclient["dcl-catalyst-client"]
contentserver --> catalystcontracts["@dcl/catalyst-contracts"]
contentserver --> contentvalidator["@dcl/content-validator"]
contentserver --> crypto["@dcl/crypto"]
contentserver --> hashing["@dcl/hashing"]
contentserver --> schemas["@dcl/schemas"]
contentserver --> snapshotsfetcher["@dcl/snapshots-fetcher"]
contentserver --> urnresolver["@dcl/urn-resolver"]
catalystclient --> catalystcommons["dcl-catalyst-commons"]
catalystclient --> catalystcontracts
catalystcontracts --> ethconnect["eth-connect"]
contentvalidator --> contenthashtree["@dcl/content-hash-tree"]
contentvalidator --> hashing
contentvalidator --> schemas
contentvalidator --> urnresolver
crypto --> schemas
crypto --> ethconnect
snapshotsfetcher --> catalyststorage["@dcl/catalyst-storage"]
snapshotsfetcher --> hashing
snapshotsfetcher --> schemas

click ethconnect "https://github.com/decentraland/eth-connect" _blank
```

# Lambdas Server dependencies
```mermaid
graph LR

lambdasserver["Lambdas Server"] --> catalystapispecs["catalyst-api-specs"]
lambdasserver --> catalystcontracts["@dcl/catalyst-contracts"]
lambdasserver --> crypto["@dcl/crypto"]
lambdasserver --> schemas["@dcl/schemas"]
lambdasserver --> urnresolver["@dcl/urn-resolver"]
lambdasserver --> catalystclient["dcl-catalyst-client"]
lambdasserver --> catalystcommons["dcl-catalyst-commons"]
catalystclient --> catalystcommons
catalystclient --> catalystcontracts
catalystcontracts --> ethconnect["eth-connect"]
crypto --> schemas
crypto --> ethconnect

click ethconnect "https://github.com/decentraland/eth-connect" _blank

```
