import 'dart:typed_data';

import 'package:ground_data/message.dart';
import 'package:ground_data/msgpack.dart';
import 'package:ground_data/transport.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class WebsocketTransportClient implements TransportClient {
  final Uri uri;
  WebsocketTransportClient(this.uri);

  @override
  Future<WebsocketConnection> connect() async {
    final channel = WebSocketChannel.connect(uri);
    await channel.ready;
    return WebsocketConnection(channel);
  }
}

class WebsocketConnection implements Connection {
  final WebSocketChannel channel;
  WebsocketConnection(this.channel);

  @override
  Future<void> send(Message message) async {
    channel.sink.add(encodeMessage(message));
  }

  @override
  Stream<Message> subscribe() {
    return channel.stream.map((bytes) => decodeMessage(bytes as Uint8List));
  }

  @override
  Future<void> close() async {
    await channel.sink.close();
  }
}
