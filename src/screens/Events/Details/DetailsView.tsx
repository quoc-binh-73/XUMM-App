/**
 * Transaction Details screen
 */
import { find, isEmpty } from 'lodash';
import moment from 'moment';

import React, { Component } from 'react';
import {
    View,
    Text,
    ScrollView,
    Platform,
    Linking,
    Alert,
    InteractionManager,
    TouchableOpacity,
    Share,
} from 'react-native';

import { BackendService, SocketService } from '@services';

import { NodeChain } from '@store/types';
import { CoreSchema, AccountSchema } from '@store/schemas/latest';
import CoreRepository from '@store/repositories/core';

import { TransactionsType } from '@common/libs/ledger/transactions/types';
import { NormalizeCurrencyCode } from '@common/libs/utils';

import { AppScreens, AppConfig } from '@common/constants';

import { ActionSheet } from '@common/helpers/interface';
import { Navigator } from '@common/helpers/navigator';

import { getAccountName, AccountNameType } from '@common/helpers/resolver';

import { Header, Badge, Spacer, Icon } from '@components/General';
import { RecipientElement } from '@components/Modules';

import Localize from '@locale';

// style
import { AppStyles } from '@theme';
import styles from './styles';

/* types ==================================================================== */

export interface PartiesDetails extends AccountNameType {
    address: string;
}

export interface Props {
    tx: TransactionsType;
    account: AccountSchema;
}

export interface State {
    partiesDetails: PartiesDetails;
    sourceDetails: PartiesDetails;
    coreSettings: CoreSchema;
    connectedChain: NodeChain;
    incomingTx: boolean;
    scamAlert: boolean;
    showMemo: boolean;
}

/* Component ==================================================================== */
class TransactionDetailsView extends Component<Props, State> {
    static screenName = AppScreens.Transaction.Details;

    static options() {
        return {
            bottomTabs: { visible: false },
        };
    }

    constructor(props: Props) {
        super(props);

        this.state = {
            sourceDetails: {
                address: '',
                name: '',
                source: '',
            },
            partiesDetails: {
                address: '',
                name: '',
                source: '',
            },
            coreSettings: CoreRepository.getSettings(),
            connectedChain: SocketService.chain,
            incomingTx: props.tx.Destination?.address === props.account.address,
            scamAlert: false,
            showMemo: true,
        };
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(() => {
            this.checkForScamAlert();
            this.setPartiesDetails();
        });
    }

    checkForScamAlert = () => {
        const { tx } = this.props;
        const { incomingTx } = this.state;

        // check for account  scam
        if (incomingTx) {
            BackendService.getAccountRisk(tx.Account.address)
                .then((accountRisk: any) => {
                    if (accountRisk && accountRisk.danger !== 'UNKNOWN') {
                        this.setState({
                            scamAlert: true,
                            showMemo: false,
                        });
                    }
                })
                .catch(() => {});
        }
    };

    setPartiesDetails = async () => {
        const { tx } = this.props;
        const { incomingTx } = this.state;

        let address = '';
        let tag;

        switch (tx.Type) {
            case 'Payment':
                if (incomingTx) {
                    address = tx.Account.address;
                } else {
                    address = tx.Destination.address;
                    tag = tx.Destination.tag;
                }
                break;
            case 'AccountDelete':
                address = tx.Destination.address;
                break;
            case 'TrustSet':
                address = tx.Issuer;
                break;
            case 'EscrowCreate':
                address = tx.Destination.address;
                tag = tx.Destination.tag;
                break;
            case 'EscrowFinish':
                address = tx.Owner;
                break;
            case 'DepositPreauth':
                address = tx.Authorize || tx.Unauthorize;
                break;
            case 'SetRegularKey':
                address = tx.RegularKey;
                break;
            default:
                break;
        }

        // no parties details
        if (!address) return;

        getAccountName(address, tag)
            .then((res: any) => {
                if (!isEmpty(res)) {
                    this.setState({
                        partiesDetails: Object.assign(res, { address }),
                    });
                }
            })
            .catch(() => {});
    };

    getTransactionLink = () => {
        const { connectedChain, coreSettings } = this.state;
        const { tx } = this.props;

        const net = connectedChain === NodeChain.Main ? 'main' : 'test';

        const explorer = find(AppConfig.explorer, { value: coreSettings.defaultExplorer });

        return `${explorer[net]}${tx.Hash}`;
    };

    shareTxLink = () => {
        const url = this.getTransactionLink();

        Share.share({
            title: Localize.t('events.shareTransactionId'),
            message: url,
            url: undefined,
        }).catch(() => {});
    };

    openTxLink = () => {
        const url = this.getTransactionLink();
        Linking.canOpenURL(url).then((supported) => {
            if (supported) {
                Linking.openURL(url);
            } else {
                Alert.alert(Localize.t('global.error'), Localize.t('global.cannotOpenLink'));
            }
        });
    };

    showMenu = () => {
        const IosButtons = [
            Localize.t('global.share'),
            Localize.t('global.openInBrowser'),
            Localize.t('global.cancel'),
        ];
        const AndroidButtons = [Localize.t('global.share'), Localize.t('global.openInBrowser')];
        ActionSheet(
            {
                options: Platform.OS === 'ios' ? IosButtons : AndroidButtons,

                cancelButtonIndex: 2,
            },
            (buttonIndex: number) => {
                if (buttonIndex === 0) {
                    this.shareTxLink();
                }
                if (buttonIndex === 1) {
                    this.openTxLink();
                }
            },
        );
    };

    renderStatus = () => {
        const { tx } = this.props;

        return (
            <>
                <Text style={[styles.labelText]}>{Localize.t('global.status')}</Text>
                <Text style={[styles.contentText]}>
                    {tx.TransactionResult.success
                        ? Localize.t('events.thisTransactionWasSuccessful')
                        : Localize.t('events.transactionFailedWithCode', { txCode: tx.TransactionResult.code })}{' '}
                    {Localize.t('events.andValidatedInLedger')}
                    <Text style={AppStyles.monoBold}> {tx.LedgerIndex} </Text>
                    {Localize.t('events.onDate')}
                    <Text style={AppStyles.monoBold}> {moment(tx.Date).format('LLLL')}</Text>
                </Text>
            </>
        );
    };

    renderOfferCreate = () => {
        const { tx } = this.props;

        let content;

        content =
            `${tx.Account.address} offered to pay ${tx.TakerGets.value} ${NormalizeCurrencyCode(
                tx.TakerGets.currency,
            )}` +
            ` in order to receive ${tx.TakerPays.value} ${NormalizeCurrencyCode(tx.TakerPays.currency)}\n` +
            `The exchange rate for this offer is ${tx.Rate} ` +
            `${NormalizeCurrencyCode(tx.TakerPays.currency)}/${NormalizeCurrencyCode(tx.TakerGets.currency)}`;

        if (tx.OfferSequence) {
            content += `\nThe transaction will also cancel ${tx.tx.Account} 's existing offer ${tx.OfferSequence}`;
        }

        if (tx.Expiration) {
            content += `\nThe offer expires at ${tx.Expiration} unless canceled or consumed before then.`;
        }

        return content;
    };

    renderOfferCancel = () => {
        const { tx } = this.props;
        return `The transaction will cancel ${tx.Account.address} offer #${tx.OfferSequence}`;
    };

    renderPayment = () => {
        const { tx } = this.props;

        let content = '';
        if (tx.Account.tag) {
            content += `The payment has a source tag:${tx.Account.tag}\n`;
        }
        if (tx.Destination.tag) {
            content += `The payment has a destination tag: ${tx.Destination.tag}\n`;
        }
        content += `It was instructed to deliver ${tx.Amount.value} ${NormalizeCurrencyCode(tx.Amount.currency)}`;
        if (tx.tx.SendMax) {
            content += ` by spending up to ${tx.SendMax.value} ${NormalizeCurrencyCode(tx.SendMax.currency)}`;
        }
        return content;
    };

    renderAccountDelete = () => {
        const { tx } = this.props;

        let content = `It deleted account ${tx.Account.address}`;

        content += `\n\nIt was instructed to deliver remaining balance ${tx.Amount.value} ${NormalizeCurrencyCode(
            tx.Amount.currency,
        )} to ${tx.Destination.address}`;

        if (tx.Account.tag) {
            content += `\nThe transaction has a source tag:${tx.Account.tag}`;
        }
        if (tx.Destination.tag) {
            content += `\nThe transaction has a destination tag: ${tx.Destination.tag}`;
        }

        return content;
    };

    renderDepositPreauth = () => {
        const { tx } = this.props;

        if (tx.Authorize) {
            return `It authorizes ${tx.Authorize} to send payments to this account`;
        }

        return `It removes the authorization for ${tx.Unauthorize} to send payments to this account`;
    };

    renderTrustSet = () => {
        const { tx } = this.props;

        if (tx.Limit === 0) {
            return `It removed TrustLine currency ${NormalizeCurrencyCode(tx.Currency)} to ${tx.Issuer}`;
        }
        return (
            `It establishes ${tx.Limit} as the maximum amount of ${NormalizeCurrencyCode(tx.Currency)} ` +
            `from ${tx.Issuer} that ${tx.Account.address} is willing to hold.`
        );
    };

    renderDescription = () => {
        const { tx } = this.props;

        let content = '';

        switch (tx.Type) {
            case 'OfferCreate':
                content += this.renderOfferCreate();
                break;
            case 'OfferCancel':
                content += this.renderOfferCancel();
                break;
            case 'Payment':
                content += this.renderPayment();
                break;
            case 'TrustSet':
                content += this.renderTrustSet();
                break;
            case 'AccountDelete':
                content += this.renderAccountDelete();
                break;
            case 'DepositPreauth':
                content += this.renderDepositPreauth();
                break;
            default:
                content += `This is a ${tx.Type} transaction`;
        }

        return (
            <>
                <Text style={[styles.labelText]}>Description</Text>
                <Text style={[styles.contentText]}>{content}</Text>
            </>
        );
    };

    renderMemos = () => {
        const { tx } = this.props;
        const { showMemo, scamAlert } = this.state;

        if (!tx.Memos) return null;

        return (
            <>
                <View style={[AppStyles.hr, AppStyles.marginVerticalSml]} />
                <Text style={[styles.labelText]}>Memos</Text>

                {showMemo ? (
                    <Text style={[styles.contentText, scamAlert && AppStyles.colorRed]}>
                        {tx.Memos.map((m) => {
                            let memo = '';
                            memo += m.type ? `${m.type}\n` : '';
                            memo += m.format ? `${m.format}\n` : '';
                            memo += m.data ? `${m.data}\n` : '';
                            return memo;
                        })}
                    </Text>
                ) : (
                    <TouchableOpacity
                        onPress={() => {
                            this.setState({ showMemo: true });
                        }}
                    >
                        <Text style={[styles.contentText, AppStyles.colorRed]}>Show Memo</Text>
                    </TouchableOpacity>
                )}
            </>
        );
    };

    renderFee = () => {
        const { tx } = this.props;

        return (
            <>
                <Text style={[styles.labelText]}>Transaction cost</Text>
                <Text style={[styles.contentText]}>
                    Sending this transaction consumed <Text style={AppStyles.monoBold}>{tx.Fee} XRP</Text>
                </Text>
            </>
        );
    };

    renderTransactionId = () => {
        const { tx } = this.props;

        return (
            <>
                <Text style={[styles.labelText]}>Transaction id</Text>
                <Text selectable style={[styles.hashText]}>
                    {tx.Hash}
                </Text>
            </>
        );
    };

    renderHeader = () => {
        const { tx } = this.props;
        const { incomingTx } = this.state;

        let iconName = '' as any;

        if (incomingTx) {
            iconName = 'IconCornerRightDown';
        } else {
            iconName = 'IconCornerLeftUp';
        }

        // show amount for Payment and Account Delete transactions
        const showAmount = tx.Type === 'Payment' || tx.Type === 'AccountDelete';

        return (
            <>
                <Text style={AppStyles.h5}>{tx.Type}</Text>
                <Spacer />
                <Badge size="medium" type="success" />
                <Spacer />
                <Text style={[styles.dateText]}>{moment(tx.Date).format('LLLL')}</Text>
                {!!showAmount && (
                    <View style={[AppStyles.row, styles.amountContainer]}>
                        <Icon name={iconName} size={27} style={AppStyles.imgColorBlue} />
                        <Text style={[styles.amountText]}>
                            {' '}
                            {tx.Amount.value} {NormalizeCurrencyCode(tx.Amount.currency)}
                        </Text>
                    </View>
                )}
            </>
        );
    };

    renderExtraHeader = () => {
        const { tx, account } = this.props;
        const { partiesDetails, incomingTx } = this.state;

        let from = {
            address: tx.Account.address,
        } as any;
        let to = {
            address: tx.Destination?.address,
        } as any;

        if (incomingTx) {
            from = Object.assign(from, partiesDetails);
            to = Object.assign(to, {
                name: account.label,
                source: 'internal:accounts',
            });
        } else {
            to = Object.assign(to, partiesDetails);
            from = Object.assign(from, {
                name: account.label,
                source: 'internal:accounts',
            });
        }

        if (!to.address) {
            return (
                <>
                    <Text style={[styles.labelText]}>From</Text>
                    <RecipientElement recipient={from} showMoreButton />
                </>
            );
        }

        return (
            <>
                <Text style={[styles.labelText]}>From</Text>
                <RecipientElement recipient={from} showMoreButton />
                <Icon name="IconArrowDown" style={AppStyles.centerSelf} />
                <Text style={[styles.labelText]}>To</Text>
                <RecipientElement recipient={to} showMoreButton />
            </>
        );
    };

    render() {
        const { scamAlert } = this.state;

        return (
            <View style={AppStyles.container}>
                <Header
                    leftComponent={{
                        icon: 'IconChevronLeft',
                        onPress: () => {
                            Navigator.pop();
                        },
                    }}
                    centerComponent={{ text: Localize.t('events.transactionDetails') }}
                    rightComponent={{
                        icon: 'IconMoreHorizontal',
                        onPress: () => {
                            this.showMenu();
                        },
                    }}
                />

                {scamAlert && (
                    <View style={styles.dangerHeader}>
                        <Text style={[AppStyles.h4, AppStyles.colorWhite]}>{Localize.t('global.fraudAlert')}</Text>
                        <Text style={[AppStyles.subtext, AppStyles.textCenterAligned, AppStyles.colorWhite]}>
                            {Localize.t(
                                'global.thisAccountIsReportedAsScamOrFraudulentAddressPleaseProceedWithCaution',
                            )}
                        </Text>
                    </View>
                )}

                <ScrollView testID="transaction-details-view">
                    <View style={styles.headerContainer}>{this.renderHeader()}</View>
                    <View style={styles.extraHeaderContainer}>{this.renderExtraHeader()}</View>
                    <View style={styles.detailsContainer}>
                        {this.renderTransactionId()}
                        <Spacer size={30} />
                        {this.renderDescription()}
                        <Spacer size={30} />
                        {this.renderFee()}
                        <Spacer size={30} />
                        {this.renderStatus()}
                        <Spacer size={30} />
                        {this.renderMemos()}
                    </View>

                    {/* renderFlags(tx); */}
                </ScrollView>
            </View>
        );
    }
}

/* Export Component ==================================================================== */
export default TransactionDetailsView;
