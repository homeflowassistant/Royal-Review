CREATE TABLE `zapier_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`locationId` varchar(128) NOT NULL,
	`connectionKeyHash` varchar(128) NOT NULL,
	`connectionKeyPreview` varchar(16) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`rotatedAt` timestamp,
	`revokedAt` timestamp,
	`lastUsedAt` timestamp,
	CONSTRAINT `zapier_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `zapier_connections_connectionKeyHash_unique` UNIQUE(`connectionKeyHash`)
);

CREATE INDEX `zapier_connections_location_active_idx`
ON `zapier_connections` (`locationId`,`active`);
