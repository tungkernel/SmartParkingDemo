-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: gateway01.ap-northeast-1.prod.aws.tidbcloud.com    Database: dbptit
-- ------------------------------------------------------
-- Server version	8.0.11-TiDB-v8.5.3-serverless

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `baidoxe`
--

DROP TABLE IF EXISTS `baidoxe`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `baidoxe` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenbaido` varchar(20) DEFAULT NULL,
  `diadiem` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `baidoxe`
--

LOCK TABLES `baidoxe` WRITE;
/*!40000 ALTER TABLE `baidoxe` DISABLE KEYS */;
INSERT INTO `baidoxe` VALUES (1,'Bãi đỗ ô tô','sân trường PTIT'),(2,'Bãi đỗ xe máy','nhà để xe cạnh PTIT'),(3,'Bãi đỗ xe đạp','sau tòa C PTIT');
/*!40000 ALTER TABLE `baidoxe` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `banggia`
--

DROP TABLE IF EXISTS `banggia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `banggia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `loaive` varchar(5) DEFAULT NULL,
  `dongia` int DEFAULT NULL,
  `idlpt` int DEFAULT NULL,
  `idlkh` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_banggia_loaiphuongtien` (`idlpt`),
  KEY `fk_banggia_loaikhachhang` (`idlkh`),
  CONSTRAINT `fk_banggia_loaiphuongtien` FOREIGN KEY (`idlpt`) REFERENCES `loaiphuongtien` (`id`),
  CONSTRAINT `fk_banggia_loaikhachhang` FOREIGN KEY (`idlkh`) REFERENCES `loaikhachhang` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `banggia`
--

LOCK TABLES `banggia` WRITE;
/*!40000 ALTER TABLE `banggia` DISABLE KEYS */;
INSERT INTO `banggia` VALUES (1,'ngày',3000,1,NULL),(2,'ngày',5000,2,NULL),(3,'ngày',10000,3,NULL),(4,'tháng',72000,1,2),(5,'tháng',120000,2,2),(6,'tháng',240000,3,2),(7,'tháng',72000,1,1),(8,'tháng',192000,2,1),(9,'tháng',288000,3,1);
/*!40000 ALTER TABLE `banggia` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `khachhang`
--

DROP TABLE IF EXISTS `khachhang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `khachhang` (
  `id` int NOT NULL AUTO_INCREMENT,
  `hoten` varchar(30) DEFAULT NULL,
  `sdt` varchar(20) NOT NULL,
  `cccd` varchar(15) NOT NULL,
  `idlkh` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `cccd` (`cccd`),
  KEY `fk_khachhang_loaikhachhang` (`idlkh`),
  CONSTRAINT `fk_khachhang_loaikhachhang` FOREIGN KEY (`idlkh`) REFERENCES `loaikhachhang` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=90001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `khachhang`
--

LOCK TABLES `khachhang` WRITE;
/*!40000 ALTER TABLE `khachhang` DISABLE KEYS */;
INSERT INTO `khachhang` VALUES (1,'TS. Nguyễn Hùng Sơn','0981112233','000000000011',1),(2,'ThS. Lê Thị Mai','0982223344','000000000012',1),(3,'TS. Phạm Văn Tuấn','0983334455','000000000013',1),(4,'Nguyễn Minh Khôi','0974445566','000000000021',2),(5,'Trần Thảo Vy','0975556677','000000000022',2),(6,'Lê Hoàng Nam','0976667788','000000000023',2),(60001,'PGS.TS. Đỗ Quang Huy','0984556677','001078000031',1),(60002,'ThS. Vũ Ngọc Linh','0985667788','001089000032',1),(60003,'Bùi Đức Anh','0977889900','001204000041',2),(60004,'Nguyễn Thị Minh Thư','0978990011','001205000042',2);
/*!40000 ALTER TABLE `khachhang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `khuvucdo`
--

DROP TABLE IF EXISTS `khuvucdo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `khuvucdo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idbdx` int DEFAULT NULL,
  `ten` varchar(5) NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `khuvucdo` (`idbdx`),
  CONSTRAINT `fk_khuvucdo_baidoxe` FOREIGN KEY (`idbdx`) REFERENCES `baidoxe` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `khuvucdo`
--

LOCK TABLES `khuvucdo` WRITE;
/*!40000 ALTER TABLE `khuvucdo` DISABLE KEYS */;
INSERT INTO `khuvucdo` VALUES (1,1,'A'),(2,1,'B'),(3,1,'C'),(11,2,'A'),(12,2,'B'),(13,2,'C'),(14,2,'D'),(15,2,'E'),(16,2,'F'),(31,3,'A'),(32,3,'B'),(33,3,'C'),(34,3,'D'),(35,3,'E');
/*!40000 ALTER TABLE `khuvucdo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loaikhachhang`
--

DROP TABLE IF EXISTS `loaikhachhang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loaikhachhang` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenloai` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loaikhachhang`
--

LOCK TABLES `loaikhachhang` WRITE;
/*!40000 ALTER TABLE `loaikhachhang` DISABLE KEYS */;
INSERT INTO `loaikhachhang` VALUES (1,'Giảng viên'),(2,'Sinh viên');
/*!40000 ALTER TABLE `loaikhachhang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `loaiphuongtien`
--

DROP TABLE IF EXISTS `loaiphuongtien`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loaiphuongtien` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenloai` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loaiphuongtien`
--

LOCK TABLES `loaiphuongtien` WRITE;
/*!40000 ALTER TABLE `loaiphuongtien` DISABLE KEYS */;
INSERT INTO `loaiphuongtien` VALUES (1,'Xe đạp'),(2,'Xe máy'),(3,'Ô tô');
/*!40000 ALTER TABLE `loaiphuongtien` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `luotdo`
--

DROP TABLE IF EXISTS `luotdo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `luotdo` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idvtd` int NOT NULL,
  `giovao` datetime NOT NULL,
  `giora` datetime DEFAULT NULL,
  `idnv` int NOT NULL,
  `idpt` int DEFAULT NULL,
  `idtx` int DEFAULT NULL,
  `idbg` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_luotdo_vitrido` (`idvtd`),
  KEY `fk_luotdo_nhanvien` (`idnv`),
  KEY `fk_luotdo_phuongtien` (`idpt`),
  KEY `fk_luotdo_thexe` (`idtx`),
  KEY `fk_luotdo_banggia` (`idbg`),
  CONSTRAINT `fk_luotdo_phuongtien` FOREIGN KEY (`idpt`) REFERENCES `phuongtien` (`id`),
  CONSTRAINT `fk_luotdo_banggia` FOREIGN KEY (`idbg`) REFERENCES `banggia` (`id`),
  CONSTRAINT `fk_luotdo_vitrido` FOREIGN KEY (`idvtd`) REFERENCES `vitrido` (`id`),
  CONSTRAINT `fk_luotdo_nhanvien` FOREIGN KEY (`idnv`) REFERENCES `nhanvien` (`id`),
  CONSTRAINT `fk_luotdo_thexe` FOREIGN KEY (`idtx`) REFERENCES `thexe` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `luotdo`
--

LOCK TABLES `luotdo` WRITE;
/*!40000 ALTER TABLE `luotdo` DISABLE KEYS */;
INSERT INTO `luotdo` VALUES (1,1,'2026-11-12 08:15:00','2026-11-12 12:15:00',1001,30001,1,3),(2,52,'2026-11-12 07:15:00','2026-11-12 15:15:00',1002,30004,2,2),(3,253,'2026-11-12 09:15:00','2026-11-12 14:15:00',1003,30008,3,1),(4,4,'2026-11-13 08:15:00','2026-11-13 17:15:00',1001,30002,4,3),(5,55,'2026-11-13 10:15:00','2026-11-13 16:15:00',1002,30005,5,2),(6,6,'2026-11-13 07:15:00','2026-11-13 18:15:00',1001,1,6,9),(7,57,'2026-11-14 08:15:00','2026-11-14 13:15:00',1002,30006,7,2),(8,258,'2026-11-14 12:15:00','2026-11-14 17:15:00',1003,30009,8,1),(9,9,'2026-11-15 09:15:00','2026-11-15 15:15:00',1001,30003,9,3),(10,60,'2026-11-15 13:15:00','2026-11-15 18:15:00',1002,30007,10,2),(11,61,'2026-11-15 07:15:00','2026-11-15 16:15:00',1002,4,11,8),(12,12,'2026-11-16 08:15:00','2026-11-16 14:15:00',1001,30001,12,3),(13,63,'2026-11-16 09:15:00','2026-11-16 17:15:00',1002,30004,13,2),(14,264,'2026-11-16 07:15:00','2026-11-16 11:15:00',1003,30008,14,1),(15,15,'2026-11-17 08:15:00','2026-11-17 16:15:00',1001,30002,15,3),(16,66,'2026-11-17 10:15:00','2026-11-17 18:15:00',1002,30005,16,2),(17,67,'2026-11-17 13:15:00','2026-11-17 19:15:00',1002,30006,17,2),(18,3,'2026-11-18 18:25:10','2026-11-18 21:25:10',1001,30003,18,3),(19,69,'2026-11-18 17:25:10','2026-11-18 20:25:10',1002,30007,19,2),(20,270,'2026-11-18 19:25:10','2026-11-18 22:25:10',1003,30009,20,1),(21,6,'2026-11-18 16:25:10','2026-11-18 19:25:10',1001,30001,21,3),(22,1,'2026-11-18 23:25:48','2026-11-18 23:25:48',1001,1,1,9),(23,2,'2026-11-18 23:25:49','2026-11-18 23:25:49',1001,2,2,9),(24,6,'2026-11-18 23:25:51','2026-11-18 23:25:51',1001,3,3,3),(25,11,'2026-11-18 23:25:53','2026-11-18 23:25:53',1001,30002,4,3),(26,51,'2026-11-18 23:25:54','2026-11-18 23:25:54',1002,4,5,8),(27,52,'2026-11-18 23:25:56','2026-11-18 23:25:56',1002,5,6,8),(28,61,'2026-11-18 23:25:57','2026-11-18 23:25:57',1002,6,7,5),(29,62,'2026-11-18 23:25:59','2026-11-18 23:25:59',1002,7,8,2),(30,71,'2026-11-18 23:26:01','2026-11-18 23:26:01',1002,30004,9,2),(31,251,'2026-11-18 23:26:02','2026-11-18 23:26:02',1003,8,10,4),(32,252,'2026-11-18 23:26:04','2026-11-18 23:26:04',1003,9,11,4),(33,256,'2026-11-18 23:26:06','2026-11-18 23:26:06',1003,10,12,1);
/*!40000 ALTER TABLE `luotdo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nhanvien`
--

DROP TABLE IF EXISTS `nhanvien`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nhanvien` (
  `id` int NOT NULL,
  `idbdx` int DEFAULT NULL,
  `hoten` varchar(30) DEFAULT NULL,
  `diachi` varchar(50) DEFAULT NULL,
  `ngaysinh` date DEFAULT NULL,
  `chucvu` varchar(10) NOT NULL,
  `sdt` varchar(10) NOT NULL,
  `ngaybatdau` date DEFAULT NULL,
  `email` varchar(30) DEFAULT NULL,
  `cccd` varchar(15) DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `nhanvien` (`idbdx`),
  UNIQUE KEY `uk_cccd` (`cccd`),
  CONSTRAINT `fk_nhanvien_baidoxe` FOREIGN KEY (`idbdx`) REFERENCES `baidoxe` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nhanvien`
--

LOCK TABLES `nhanvien` WRITE;
/*!40000 ALTER TABLE `nhanvien` DISABLE KEYS */;
INSERT INTO `nhanvien` VALUES (3,3,'Lê Minh Cường','Cầu Giấy, HN','1992-11-05','Quản lý','0912345673','2023-09-15','cuong@ptit.edu.vn','001092000333'),(1001,1,'Nguyễn Văn An','Hà Đông, Hà Nội','1994-05-14','Bảo vệ','0912345671','2024-01-15','an.nv@ptit.edu.vn','001094001001'),(1002,2,'Trần Quốc Bảo','Thanh Xuân, Hà Nội','1996-08-21','Bảo vệ','0912345672','2024-02-10','bao.tq@ptit.edu.vn','001096001002'),(1003,3,'Phạm Minh Đức','Nam Từ Liêm, Hà Nội','1993-11-03','Bảo vệ','0912345673','2023-11-20','duc.pm@ptit.edu.vn','001093001003'),(2001,1,'Trần Thị Bình','Đống Đa, Hà Nội','1998-04-19','Thu ngân','0912345674','2024-03-01','binh.tt@ptit.edu.vn','001098002001'),(2002,2,'Lê Thu Hà','Cầu Giấy, Hà Nội','1999-09-25','Thu ngân','0912345675','2024-04-12','ha.lt@ptit.edu.vn','001099002002'),(2003,3,'Hoàng Lan Anh','Hoàng Mai, Hà Nội','1997-12-08','Thu ngân','0912345676','2024-05-05','anh.hl@ptit.edu.vn','001097002003');
/*!40000 ALTER TABLE `nhanvien` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `phuongtien`
--

DROP TABLE IF EXISTS `phuongtien`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phuongtien` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bienso` varchar(8) DEFAULT NULL,
  `idlpt` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `bienso` (`bienso`),
  KEY `fk_phuongtien_loaiphuongtien` (`idlpt`),
  CONSTRAINT `fk_phuongtien_loaiphuongtien` FOREIGN KEY (`idlpt`) REFERENCES `loaiphuongtien` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `phuongtien`
--

LOCK TABLES `phuongtien` WRITE;
/*!40000 ALTER TABLE `phuongtien` DISABLE KEYS */;
INSERT INTO `phuongtien` VALUES (1,'30A88642',3),(2,'30E54321',3),(3,'29A71905',3),(4,'29B67890',2),(5,'29D45218',2),(6,'29C90311',2),(7,'29E22468',2),(8,'XD0001',1),(9,'XD0002',1),(10,'XD0003',1),(30001,'30H12899',3),(30002,'30F40512',3),(30003,'29A99234',3),(30004,'29H33456',2),(30005,'29K77821',2),(30006,'29L51209',2),(30007,'29M60433',2),(30008,'XD0004',1),(30009,'XD0005',1);
/*!40000 ALTER TABLE `phuongtien` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thanhtoan`
--

DROP TABLE IF EXISTS `thanhtoan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thanhtoan` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idld` int NOT NULL,
  `chiphi` int NOT NULL,
  `giothanhtoan` datetime NOT NULL,
  `trangthai` varchar(10) NOT NULL,
  `idnv` int NOT NULL,
  `loaithanhtoan` tinyint(1) DEFAULT NULL,
  `idvt` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_thoantoan_luotdo` (`idld`),
  KEY `fk_thanhtoan_nhanvien` (`idnv`),
  KEY `fk_thanhtoan_vethang` (`idvt`),
  CONSTRAINT `fk_thoantoan_luotdo` FOREIGN KEY (`idld`) REFERENCES `luotdo` (`id`),
  CONSTRAINT `fk_thanhtoan_vethang` FOREIGN KEY (`idvt`) REFERENCES `vethang` (`id`),
  CONSTRAINT `fk_thanhtoan_nhanvien` FOREIGN KEY (`idnv`) REFERENCES `nhanvien` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thanhtoan`
--

LOCK TABLES `thanhtoan` WRITE;
/*!40000 ALTER TABLE `thanhtoan` DISABLE KEYS */;
INSERT INTO `thanhtoan` VALUES (1,1,10000,'2026-11-12 12:15:00','Thành công',2001,0,NULL),(2,2,5000,'2026-11-12 15:15:00','Thành công',2001,0,NULL),(3,3,3000,'2026-11-12 14:15:00','Thành công',2002,0,NULL),(4,4,10000,'2026-11-13 17:15:00','Thành công',2002,0,NULL),(5,5,5000,'2026-11-13 16:15:00','Thành công',2003,0,NULL),(6,6,0,'2026-11-13 18:15:00','Thành công',2001,1,1),(7,7,5000,'2026-11-14 13:15:00','Thành công',2001,0,NULL),(8,8,3000,'2026-11-14 17:15:00','Thành công',2002,0,NULL),(9,9,10000,'2026-11-15 15:15:00','Thành công',2003,0,NULL),(10,10,5000,'2026-11-15 18:15:00','Thành công',2001,0,NULL),(11,11,0,'2026-11-15 16:15:00','Thành công',2002,1,2),(12,12,10000,'2026-11-16 14:15:00','Thành công',2001,0,NULL),(13,13,5000,'2026-11-16 17:15:00','Thành công',2003,0,NULL),(14,14,3000,'2026-11-16 11:15:00','Thành công',2001,0,NULL),(15,15,10000,'2026-11-17 16:15:00','Thành công',2002,0,NULL),(16,16,5000,'2026-11-17 18:15:00','Thành công',2003,0,NULL),(17,17,5000,'2026-11-17 19:15:00','Thành công',2001,0,NULL),(18,18,10000,'2026-11-18 21:25:10','Thành công',2001,0,NULL),(19,19,5000,'2026-11-18 20:25:10','Thành công',2002,0,NULL),(20,20,3000,'2026-11-18 22:25:10','Thành công',2003,0,NULL),(21,21,10000,'2026-11-18 19:25:10','Thành công',2001,0,NULL);
/*!40000 ALTER TABLE `thanhtoan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thexe`
--

DROP TABLE IF EXISTS `thexe`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thexe` (
  `id` int NOT NULL AUTO_INCREMENT,
  `maso` varchar(10) DEFAULT NULL,
  `trangthai` tinyint DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `maso` (`maso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30002;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thexe`
--

LOCK TABLES `thexe` WRITE;
/*!40000 ALTER TABLE `thexe` DISABLE KEYS */;
INSERT INTO `thexe` VALUES (1,'001',0),(2,'002',0),(3,'003',0),(4,'004',0),(5,'005',0),(6,'006',0),(7,'007',0),(8,'008',0),(9,'009',0),(10,'010',0),(11,'011',0),(12,'012',0),(13,'013',1),(14,'014',1),(15,'015',1),(16,'016',1),(17,'017',1),(18,'018',1),(19,'019',1),(20,'020',1),(21,'021',1),(22,'022',1),(23,'023',1),(24,'024',1),(25,'025',1),(26,'026',1),(27,'027',1),(28,'028',1),(29,'029',1),(30,'030',1),(31,'031',1),(32,'032',1),(33,'033',1),(34,'034',1),(35,'035',1),(36,'036',1),(37,'037',1),(38,'038',1),(39,'039',1),(40,'040',1),(41,'101',1),(42,'102',1),(43,'103',1),(44,'104',1),(45,'105',1),(46,'106',1),(47,'107',1),(48,'108',1),(49,'109',1),(50,'110',1);
/*!40000 ALTER TABLE `thexe` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vethang`
--

DROP TABLE IF EXISTS `vethang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vethang` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ngaybatdau` date DEFAULT NULL,
  `ngayketthuc` date DEFAULT NULL,
  `idtx` int DEFAULT NULL,
  `idpt` int DEFAULT NULL,
  `idbg` int DEFAULT NULL,
  `idkh` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_vethang_thexe` (`idtx`),
  KEY `fk_vethang_phuongtien` (`idpt`),
  KEY `fk_vethang_banggia` (`idbg`),
  KEY `fk_vethang_khachhang` (`idkh`),
  CONSTRAINT `fk_vethang_phuongtien` FOREIGN KEY (`idpt`) REFERENCES `phuongtien` (`id`),
  CONSTRAINT `fk_vethang_banggia` FOREIGN KEY (`idbg`) REFERENCES `banggia` (`id`),
  CONSTRAINT `fk_vethang_khachhang` FOREIGN KEY (`idkh`) REFERENCES `khachhang` (`id`),
  CONSTRAINT `fk_vethang_thexe` FOREIGN KEY (`idtx`) REFERENCES `thexe` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vethang`
--

LOCK TABLES `vethang` WRITE;
/*!40000 ALTER TABLE `vethang` DISABLE KEYS */;
INSERT INTO `vethang` VALUES (1,'2026-11-18','2026-12-18',41,1,9,1),(2,'2026-11-18','2026-12-18',42,4,8,1),(3,'2026-11-18','2026-12-18',43,2,9,2),(4,'2026-11-18','2026-12-18',44,5,8,3),(5,'2026-11-18','2026-12-18',45,6,5,4),(6,'2026-11-18','2026-12-18',46,8,4,4),(7,'2026-11-18','2026-12-18',47,9,4,5),(8,'2026-10-18','2026-11-17',48,10,4,6);
/*!40000 ALTER TABLE `vethang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vitrido`
--

DROP TABLE IF EXISTS `vitrido`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vitrido` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idkvd` int DEFAULT NULL,
  `sothutu` int DEFAULT NULL,
  `trangthai` tinyint DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_vitrido_khuvucdo` (`idkvd`),
  UNIQUE KEY `unique_khu_stt` (`idkvd`,`sothutu`),
  CONSTRAINT `fk_vitrido_khuvucdo` FOREIGN KEY (`idkvd`) REFERENCES `khuvucdo` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vitrido`
--

LOCK TABLES `vitrido` WRITE;
/*!40000 ALTER TABLE `vitrido` DISABLE KEYS */;
INSERT INTO `vitrido` VALUES (1,1,1,0),(2,1,2,0),(3,1,3,1),(4,1,4,1),(5,1,5,1),(6,2,1,0),(7,2,2,1),(8,2,3,1),(9,2,4,1),(10,2,5,1),(11,3,1,0),(12,3,2,1),(13,3,3,1),(14,3,4,1),(15,3,5,1),(51,11,1,0),(52,11,2,0),(53,11,3,1),(54,11,4,1),(55,11,5,1),(56,11,6,1),(57,11,7,1),(58,11,8,1),(59,11,9,1),(60,11,10,1),(61,12,1,0),(62,12,2,0),(63,12,3,1),(64,12,4,1),(65,12,5,1),(66,12,6,1),(67,12,7,1),(68,12,8,1),(69,12,9,1),(70,12,10,1),(71,13,1,0),(72,13,2,1),(73,13,3,1),(74,13,4,1),(75,13,5,1),(76,13,6,1),(77,13,7,1),(78,13,8,1),(79,13,9,1),(80,13,10,1),(81,14,1,1),(82,14,2,1),(83,14,3,1),(84,14,4,1),(85,14,5,1),(86,14,6,1),(87,14,7,1),(88,14,8,1),(89,14,9,1),(90,14,10,1),(91,15,1,1),(92,15,2,1),(93,15,3,1),(94,15,4,1),(95,15,5,1),(96,15,6,1),(97,15,7,1),(98,15,8,1),(99,15,9,1),(100,15,10,1),(101,16,1,1),(102,16,2,1),(103,16,3,1),(104,16,4,1),(105,16,5,1),(106,16,6,1),(107,16,7,1),(108,16,8,1),(109,16,9,1),(110,16,10,1),(251,31,1,0),(252,31,2,0),(253,31,3,1),(254,31,4,1),(255,31,5,1),(256,31,6,0),(257,31,7,1),(258,31,8,1),(259,31,9,1),(260,31,10,1),(261,32,1,1),(262,32,2,1),(263,32,3,1),(264,32,4,1),(265,32,5,1),(266,32,6,1),(267,32,7,1),(268,32,8,1),(269,32,9,1),(270,32,10,1),(271,33,1,1),(272,33,2,1),(273,33,3,1),(274,33,4,1),(275,33,5,1),(276,33,6,1),(277,33,7,1),(278,33,8,1),(279,33,9,1),(280,33,10,1);
/*!40000 ALTER TABLE `vitrido` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-19 16:00:18
